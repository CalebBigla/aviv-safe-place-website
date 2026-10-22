import { queryOptions } from "@tanstack/react-query";
import { getPublicContent } from "./content.functions";
export const contentQuery = queryOptions({
  queryKey: ["aviv-public-content"],
  queryFn: () => getPublicContent(),
  staleTime: 60000,
});
