import { describe,it,expect } from 'vitest';
import { cmsSchema } from '@/lib/aviv/admin-schema';
describe('AVIV CMS validation',()=>{
  const service={kind:'services',title:'Test',slug:'test',description:'',full_description:'',audience:'',duration_minutes:60,price_minor:10000,currency:'NGN',delivery_format:'',published:false,active:false,sort_order:0};
  it('requires integer kobo and positive duration',()=>{expect(cmsSchema.safeParse(service).success).toBe(true);expect(cmsSchema.safeParse({...service,price_minor:1.5}).success).toBe(false);expect(cmsSchema.safeParse({...service,duration_minutes:0}).success).toBe(false);});
  it('rejects secrets as public CMS setting keys',()=>{expect(cmsSchema.safeParse({kind:'public_settings',key:'paystack_secret',value:'test',published:true}).success).toBe(false);});
  it('only accepts existing public page keys',()=>{expect(cmsSchema.safeParse({kind:'pages',slug:'unknown',title:'Test',body:'',seo_title:'',seo_description:'',published:true,content:{}}).success).toBe(false);});
});