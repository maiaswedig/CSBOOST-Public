// Rebuild only self-contained logo geometry. Never insert source markup into the DOM.
const tags=new Set(['svg','g','path','rect','circle','ellipse','polygon','polyline','line','defs','clipPath','linearGradient','radialGradient','stop']);
const numbers=new Set(['x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height','viewBox','points','stroke-width','stroke-miterlimit','opacity','fill-opacity','stroke-opacity','offset']);
const colors=new Set(['fill','stroke','stop-color']);
const cssKeys=new Set(['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill-rule','clip-rule','opacity','fill-opacity','stroke-opacity']);
function safeAttribute(key,value){
  if(numbers.has(key))return /^[\d\s.,+eE%px-]{1,40000}$/.test(value);
  if(colors.has(key))return /^(?:#[\da-fA-F]{3,8}|none|currentColor|transparent|white|black|red|blue|green|url\(#[a-zA-Z_][\w-]{0,63}\))$/.test(value);
  if(key==='d')return /^[MmZzLlHhVvCcSsQqTtAa\d\s.,+eE-]{1,60000}$/.test(value);
  if(key==='transform'||key==='gradientTransform')return /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([\d\s.,+eE-]+\)\s*)+$/.test(value);
  if(key==='id')return /^[a-zA-Z_][\w-]{0,63}$/.test(value);
  if(key==='clip-path')return /^url\(#[a-zA-Z_][\w-]{0,63}\)$/.test(value);
  if(key==='fill-rule'||key==='clip-rule')return /^(?:evenodd|nonzero)$/.test(value);
  if(key==='stroke-linecap')return /^(?:butt|round|square)$/.test(value);
  if(key==='stroke-linejoin')return /^(?:miter|round|bevel)$/.test(value);
  if(key==='gradientUnits')return /^(?:userSpaceOnUse|objectBoundingBox)$/.test(value);
  return false;
}
function declarations(text){const result={};for(const part of text.split(';')){if(!part.trim())continue;const match=part.trim().match(/^([a-z-]+)\s*:\s*([^:]+)$/);if(!match)throw Error('Estilo de logo incompatível.');const [,key,value]=match;if(key==='enable-background')continue;if(!cssKeys.has(key)||!safeAttribute(key,value.trim()))throw Error('Estilo de logo incompatível.');result[key]=value.trim();}return result;}
export function sanitizeTeamSvg(input){
  if(typeof input!=='string'||Buffer.byteLength(input)>65536)throw Error('Logo grande demais.');
  let source=input.replace(/^\uFEFF/,'').replace(/<\?xml\s[^?]*\?>/,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(title|desc|metadata)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  if(/<!|<\?|&/.test(source))throw Error('Logo contém referências externas.');
  const styles=new Map();source=source.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi,(_tag,css)=>{let remainder=css.replace(/\.([a-zA-Z_][\w-]*)\s*\{([^}]+)\}/g,(_rule,name,body)=>{styles.set(name,declarations(body));return '';});if(remainder.trim())throw Error('Estilo de logo incompatível.');return '';});
  const stack=[],output=[];let offset=0,roots=0;
  for(const match of source.matchAll(/<[^>]+>/g)){
    if(source.slice(offset,match.index).trim())throw Error('Texto inesperado no logo.');offset=match.index+match[0].length;
    const token=match[0].match(/^<(\/)?([a-zA-Z]+)([\s\S]*?)(\/)?\s*>$/);if(!token||!tags.has(token[2]))throw Error('Elemento de logo incompatível.');
    const [,closing,tag,attrs,selfClosing]=token;if(closing){if(attrs.trim()||selfClosing||stack.pop()!==tag)throw Error('Estrutura de logo inválida.');output.push('</'+tag+'>');continue;}
    if(!stack.length){if(tag!=='svg'||roots++)throw Error('Raiz de logo inválida.');}
    const values={};let consumed=0;for(const attr of attrs.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(["'])([^"']*)\2/g)){
      if(attrs.slice(consumed,attr.index).trim())throw Error('Atributo de logo inválido.');consumed=attr.index+attr[0].length;const [,key,,value]=attr;
      if(['xmlns','xmlns:xlink','version','xml:space'].includes(key))continue;
      if(key==='class'){for(const name of value.split(/\s+/)){if(!styles.has(name))throw Error('Classe de logo desconhecida.');Object.assign(values,styles.get(name));}continue;}
      if(key==='style'){Object.assign(values,declarations(value));continue;}
      if(!safeAttribute(key,value))throw Error('Atributo de logo incompatível.');values[key]=value;
    }
    if(attrs.slice(consumed).trim())throw Error('Atributo de logo inválido.');
    if(tag==='svg'){values.xmlns='http://www.w3.org/2000/svg';if(!values.viewBox)throw Error('Logo sem proporção.');values.width='120';values.height='120';}
    output.push('<'+tag+Object.entries(values).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>' '+key+'="'+value+'"').join('')+(selfClosing?'/>':'>'));if(!selfClosing)stack.push(tag);
  }
  if(!roots||stack.length||source.slice(offset).trim())throw Error('Estrutura de logo inválida.');return output.join('');
}
