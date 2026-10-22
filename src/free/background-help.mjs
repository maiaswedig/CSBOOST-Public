export const BACKGROUND_HELP=Object.freeze({
  startup:'ms-settings:startupapps',
  privacy:'https://support.discord.com/hc/en-us/articles/360004109911-Data-Privacy-Controls',
  clips:'https://support.discord.com/hc/pt-br/articles/16861982215703-Clipes',
  overlay:'https://support.discord.com/hc/en-us/articles/217659737-Game-Overlay-101',
  notifications:'ms-settings:notifications',
  motion:'https://support.discord.com/hc/en-us/articles/360040613412-Reduced-Motion-Setting',
  voice:'https://support.discord.com/hc/en-us/articles/360040843952-Krisp-FAQ',
  video:'https://support.discord.com/hc/en-us/articles/360045138471-Discord-Voice-and-Video-Troubleshooting-Guide',
  chrome:'https://support.google.com/chrome/answer/12929150',
  edge:'https://support.microsoft.com/en-us/edge/learn-about-performance-features-in-microsoft-edge',
});
export function backgroundHelpUrl(options){
  if(!options||Object.keys(options).join('|')!=='topic'||typeof options.topic!=='string'||!Object.hasOwn(BACKGROUND_HELP,options.topic))throw Error('Ajuda de aplicativos inválida.');
  return BACKGROUND_HELP[options.topic];
}
