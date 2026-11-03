import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, MicOff, PhoneOff, RefreshCw, Video, VideoOff, Volume2 } from "lucide-react";
import type {
  IAgoraRTC,
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import { Unavailable } from "@/components/aviv-site";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLagosDateTime, formatLagosTime } from "@/lib/aviv/schedule";
import type { SessionAccess, SessionDetails } from "@/lib/aviv/session-schema";

// The SDK touches browser globals on import and is large, so it loads only when a person sets up
// their devices. import.meta.env.SSR keeps it out of the server bundle entirely.
async function loadAgora(): Promise<IAgoraRTC> {
  if (import.meta.env.SSR) throw new Error("Video sessions run in the browser.");
  const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
  AgoraRTC.setLogLevel(3);
  AgoraRTC.disableLogUpload();
  return AgoraRTC;
}

const hexBytes = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));

const closedMessages: Record<
  Exclude<SessionAccess["status"], "ready" | "early">,
  { title: string; description: string }
> = {
  ended: {
    title: "This session has ended",
    description: "The room for this appointment has closed. No video room is available.",
  },
  unavailable: {
    title: "Session link unavailable",
    description:
      "This link is invalid, expired or no longer active. If your appointment has moved, open your booking link to enter the new session.",
  },
  rate_limited: {
    title: "Please try again shortly",
    description:
      "There have been too many attempts to open this session from this connection. Please wait a few minutes and refresh.",
  },
  infrastructure: {
    title: "Session temporarily unavailable",
    description: "We couldn't open this session right now. Please try again shortly.",
  },
  not_configured: {
    title: "Video sessions aren't available yet",
    description: "Secure video sessions aren't connected yet. Please contact AVIV.",
  },
};

export interface SessionRoomProps {
  queryKey: readonly unknown[];
  loadAccess: () => Promise<SessionAccess>;
  remoteLabel: string;
}

export function SessionRoom({ queryKey, loadAccess, remoteLabel }: SessionRoomProps) {
  const access = useQuery({
    queryKey,
    queryFn: loadAccess,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    // Waiting rooms open by themselves when the time comes.
    refetchInterval: (query) => (query.state.data?.status === "early" ? 30000 : false),
  });
  // The room stays mounted once entered: a refetch must never interrupt a live session.
  const [session, setSession] = useState<SessionDetails | null>(null);
  useEffect(() => {
    if (access.data?.status === "ready") setSession(access.data.session);
  }, [access.data]);
  if (session) return <Room session={session} loadAccess={loadAccess} remoteLabel={remoteLabel} />;
  if (access.isPending || access.data?.status === "ready")
    return (
      <section className="site-wrap section" role="status" aria-label="Loading session">
        <Skeleton className="h-12 w-60" />
        <Skeleton className="h-64 mt-8" />
      </section>
    );
  if (access.data?.status === "early")
    return (
      <Unavailable
        title="Your session room isn't open yet"
        description={`The room opens at ${formatLagosDateTime(access.data.opensAt)} (Lagos time). This page will open it for you when the time comes.`}
      />
    );
  return <Unavailable {...closedMessages[access.data?.status ?? "infrastructure"]} />;
}

type Phase = "setup" | "preview" | "joining" | "live" | "left" | "closed";

function Room({
  session,
  loadAccess,
  remoteLabel,
}: {
  session: SessionDetails;
  loadAccess: () => Promise<SessionAccess>;
  remoteLabel: string;
}) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [closedNote, setClosedNote] = useState("");
  const [notice, setNotice] = useState("");
  const [micAvailable, setMicAvailable] = useState(false);
  const [camAvailable, setCamAvailable] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remotePresent, setRemotePresent] = useState(false);
  const [remoteVideo, setRemoteVideo] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const client = useRef<IAgoraRTCClient | null>(null);
  const mic = useRef<IMicrophoneAudioTrack | null>(null);
  const cam = useRef<ICameraVideoTrack | null>(null);
  const localView = useRef<HTMLDivElement>(null);
  const remoteView = useRef<HTMLDivElement>(null);

  // Closing the tracks releases the devices, which also turns off the camera light.
  const stop = useCallback(async () => {
    mic.current?.close();
    cam.current?.close();
    mic.current = null;
    cam.current = null;
    const current = client.current;
    client.current = null;
    await current?.leave().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onHide = () => void stop();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void stop();
    };
  }, [stop]);

  const close = useCallback(
    (note: string) => {
      void stop();
      setClosedNote(note);
      setPhase("closed");
    },
    [stop],
  );

  const setUpDevices = async () => {
    setNotice("");
    try {
      const agora = await loadAgora();
      if (!agora.checkSystemRequirements()) {
        setNotice(
          "This browser can't run video sessions. Please use a current version of Chrome, Safari, Edge or Firefox.",
        );
        return;
      }
      agora.onAutoplayFailed = () => setSoundBlocked(true);
      const [audio, video] = await Promise.allSettled([
        agora.createMicrophoneAudioTrack(),
        agora.createCameraVideoTrack(),
      ]);
      if (audio.status === "fulfilled") mic.current = audio.value;
      if (video.status === "fulfilled") {
        cam.current = video.value;
        if (localView.current) video.value.play(localView.current);
      }
      setMicAvailable(audio.status === "fulfilled");
      setCamAvailable(video.status === "fulfilled");
      setMicOn(audio.status === "fulfilled");
      setCamOn(video.status === "fulfilled");
      if (audio.status === "rejected" && video.status === "rejected")
        setNotice(
          "We couldn't reach your camera or microphone. Allow access in your browser settings and try again, or join to listen only.",
        );
      else if (audio.status === "rejected")
        setNotice(
          "We couldn't reach your microphone. Allow access in your browser settings and refresh, otherwise you won't be heard.",
        );
      else if (video.status === "rejected")
        setNotice("We couldn't reach your camera. You can still join with voice only.");
      setPhase("preview");
    } catch {
      setNotice("The video service couldn't load. Check your connection and try again.");
    }
  };

  const renew = useCallback(
    async (active: IAgoraRTCClient) => {
      for (let attempt = 0; attempt < 3 && client.current === active; attempt++) {
        try {
          const next = await loadAccess();
          if (client.current !== active) return;
          if (next.status === "ready") {
            await active.renewToken(next.join.token);
            return;
          }
          if (next.status === "ended" || next.status === "unavailable") {
            close(closedMessages[next.status].title);
            return;
          }
        } catch {
          // A brief network problem is retried; the session continues until the token lapses.
        }
        await new Promise((resolve) => setTimeout(resolve, 8000));
      }
    },
    [close, loadAccess],
  );

  const join = async () => {
    setPhase("joining");
    setNotice("");
    let active: IAgoraRTCClient | null = null;
    try {
      // Fetched now rather than on page load so time spent checking devices can't age the token.
      const access = await loadAccess();
      if (access.status !== "ready") {
        close(
          access.status === "early"
            ? "The room isn't open yet."
            : closedMessages[access.status].title,
        );
        return;
      }
      const { join: credentials } = access;
      const agora = await loadAgora();
      active = agora.createClient({ mode: "rtc", codec: "vp8" });
      const rtc = active;
      client.current = rtc;
      rtc.setEncryptionConfig("aes-256-gcm2", credentials.secret, hexBytes(credentials.salt));
      rtc.on("user-joined", () => setRemotePresent(true));
      rtc.on("user-left", () => {
        setRemotePresent(false);
        setRemoteVideo(false);
      });
      rtc.on("user-published", async (user, mediaType) => {
        await rtc.subscribe(user, mediaType);
        setRemotePresent(true);
        if (mediaType === "video" && remoteView.current) {
          user.videoTrack?.play(remoteView.current, { fit: "contain" });
          setRemoteVideo(true);
        }
        if (mediaType === "audio") user.audioTrack?.play();
      });
      rtc.on("user-unpublished", (_user, mediaType) => {
        if (mediaType === "video") setRemoteVideo(false);
      });
      rtc.on("token-privilege-will-expire", () => void renew(rtc));
      rtc.on("token-privilege-did-expire", () =>
        close("Your connection to the session has ended."),
      );
      rtc.on("connection-state-change", (state, _previous, reason) => {
        setReconnecting(state === "RECONNECTING");
        if (state === "DISCONNECTED" && reason && reason !== "LEAVE" && client.current === rtc)
          close(
            "You were disconnected. This can happen if the session is opened in another tab or on another device.",
          );
      });
      await rtc.join(credentials.appId, credentials.channel, credentials.token, credentials.uid);
      const tracks = [mic.current, cam.current].filter(
        (track): track is IMicrophoneAudioTrack | ICameraVideoTrack =>
          track !== null && track.enabled,
      );
      if (tracks.length) await rtc.publish(tracks);
      setPhase("live");
    } catch {
      client.current = null;
      await active?.leave().catch(() => undefined);
      setNotice("We couldn't connect you to the session. Check your connection and try again.");
      setPhase("preview");
    }
  };

  const toggleMic = async () => {
    if (!mic.current) return;
    const next = !micOn;
    await mic.current.setMuted(!next);
    setMicOn(next);
  };

  // Disabling (rather than muting) the camera turns it off at the device.
  const toggleCam = async () => {
    const track = cam.current;
    if (!track) return;
    const next = !camOn;
    try {
      await track.setEnabled(next);
      setCamOn(next);
      if (!next) return;
      if (localView.current) track.play(localView.current);
      const rtc = client.current;
      if (rtc?.connectionState === "CONNECTED" && !rtc.localTracks.includes(track))
        await rtc.publish(track);
    } catch {
      setNotice("We couldn't change your camera. Please try again.");
    }
  };

  const leave = () => {
    void stop();
    setPhase("left");
  };

  const inCall = phase === "joining" || phase === "live";
  const showStage = phase === "preview" || inCall;
  const finished = phase === "left" || phase === "closed";
  return (
    <section className="site-wrap section video-session">
      <div className="eyebrow">Private video session</div>
      <h1 className="text-3xl md:text-4xl mt-4 mb-2">{session.service || "Your session"}</h1>
      <p className="section-copy mb-6">
        {formatLagosDateTime(session.start)} – {formatLagosTime(session.end)} (Lagos time)
      </p>
      {notice && (
        <p role="alert" className="video-notice">
          {notice}
        </p>
      )}
      {phase === "setup" && (
        <div className="video-card">
          <h2 className="text-2xl mb-3">Before you join</h2>
          <p className="section-copy mb-6">
            Find a quiet, private place. Your browser will ask to use your camera and microphone.
            Sessions are private and are not recorded.
          </p>
          <Button onClick={() => void setUpDevices()}>
            <Video />
            Turn on camera and microphone
          </Button>
        </div>
      )}
      {finished && (
        <div className="video-card">
          <h2 className="text-2xl mb-3">
            {phase === "left" ? "You've left the session" : "The session has closed"}
          </h2>
          <p className="section-copy mb-6">
            {phase === "left"
              ? "Your camera and microphone are off. You can rejoin while the room is open."
              : closedNote}
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw />
            {phase === "left" ? "Rejoin" : "Check again"}
          </Button>
        </div>
      )}
      {/* Both views stay mounted so media can start before the call screen has rendered. */}
      <div className={showStage ? "video-stage" : "hidden"} data-in-call={inCall}>
        <div className="video-remote" hidden={!inCall}>
          <div ref={remoteView} className="video-surface" />
          {!remoteVideo && (
            <p className="video-placeholder" role="status">
              {phase === "joining"
                ? "Connecting…"
                : remotePresent
                  ? `${remoteLabel} has joined with their camera off`
                  : `Waiting for ${remoteLabel.toLowerCase()} to join…`}
            </p>
          )}
        </div>
        <div className="video-local">
          <div ref={localView} className="video-surface" />
          {!camOn && <p className="video-placeholder">Your camera is off</p>}
          <span className="video-tag">You</span>
        </div>
      </div>
      {reconnecting && (
        <p role="status" className="video-notice">
          Your connection dropped. Reconnecting…
        </p>
      )}
      {soundBlocked && inCall && (
        <Button variant="outline" className="mt-4" onClick={() => setSoundBlocked(false)}>
          <Volume2 />
          Turn on sound
        </Button>
      )}
      {showStage && (
        <div className="video-controls">
          <Button
            variant="outline"
            disabled={!micAvailable}
            aria-pressed={!micOn}
            onClick={() => void toggleMic()}
          >
            {micOn ? <Mic /> : <MicOff />}
            {micOn ? "Mute" : "Unmute"}
          </Button>
          <Button
            variant="outline"
            disabled={!camAvailable}
            aria-pressed={!camOn}
            onClick={() => void toggleCam()}
          >
            {camOn ? <Video /> : <VideoOff />}
            {camOn ? "Stop camera" : "Start camera"}
          </Button>
          {phase === "preview" ? (
            <Button onClick={() => void join()}>Join session</Button>
          ) : (
            <Button variant="destructive" disabled={phase === "joining"} onClick={leave}>
              <PhoneOff />
              Leave session
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
