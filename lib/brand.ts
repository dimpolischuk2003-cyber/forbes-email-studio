// Shared Forbes assets are shipped with this Vercel project, so every marketer
// receives the same defaults without changing cookies or historical save hashes.
export const brandOrigin='https://forbes-email-studio.vercel.app';
export const brandLogoUrl=brandOrigin+'/brand/forbes-ukraine-black.png';
export const brandSocialLinks=[
 {label:'Instagram',url:'https://www.instagram.com/forbes.ukraine.official/'},
 {label:'Facebook',url:'https://www.facebook.com/Forbes.Ukraine.official/'},
 {label:'YouTube',url:'https://www.youtube.com/@ForbesUkraine'},
 {label:'LinkedIn',url:'https://www.linkedin.com/company/forbes-ukraine/'},
 {label:'Telegram',url:'https://telegram.me/Forbes_Ukraine_official'},
];
export const legacyBannerSource='https://forbes.ua/static/storage/originals/4/5f/7dff0e36e44f355e76715166911cf5f4.jpg';
export const stableBannerUrl=brandOrigin+'/brand/magazine-subscription-banner.jpg';
export function stableImageUrl(url:string){return url===legacyBannerSource?stableBannerUrl:url;}

export function socialIconUrl(value:string){
 try{const host=new URL(value).hostname.toLowerCase().replace(/^www\./,'');const icons:Record<string,string>={'instagram.com':'instagram','facebook.com':'facebook','fb.com':'facebook','youtube.com':'youtube','youtu.be':'youtube','linkedin.com':'linkedin','telegram.me':'telegram','t.me':'telegram'};return icons[host]?brandOrigin+'/brand/social/'+icons[host]+'.png':null;}catch{return null;}
}
