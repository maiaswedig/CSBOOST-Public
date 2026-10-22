const fs=require('node:fs');
const zlib=require('node:zlib');
function createIcon(destination){
  const width=256,rows=Buffer.alloc((width*4+1)*width);
  const bolt=[[146,65],[98,138],[130,138],[116,193],[174,112],[141,112]];
  function insidePolygon(x,y){let inside=false;for(let i=0,j=bolt.length-1;i<bolt.length;j=i++){const a=bolt[i],b=bolt[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    let alpha=0,brightness=0;
    for(const dx of [.25,.75])for(const dy of [.25,.75]){
      const xx=x+dx,yy=y+dy,cx=Math.max(35,Math.min(221,xx)),cy=Math.max(35,Math.min(221,yy));
      if(Math.hypot(xx-cx,yy-cy)>35)continue;
      alpha++;const radius=Math.hypot(xx-128,yy-128),angle=Math.atan2(yy-128,xx-128);
      brightness+=(radius>=69&&radius<=91&&Math.abs(angle)>Math.PI/4)||insidePolygon(xx,yy)?255:21;
    }
    const offset=y*(width*4+1)+1+x*4,value=alpha?Math.round(brightness/alpha):0;
    rows[offset]=value;rows[offset+1]=value;rows[offset+2]=value;rows[offset+3]=Math.round(alpha/4*255);
  }
  function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
  function chunk(type,data){const body=Buffer.concat([Buffer.from(type),data]),header=Buffer.alloc(4),checksum=Buffer.alloc(4);header.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(body));return Buffer.concat([header,body,checksum]);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(width,4);ihdr[8]=8;ihdr[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
  const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
  fs.writeFileSync(destination,Buffer.concat([header,png]));
}
module.exports={createIcon};
