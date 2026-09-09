import { MAX_BYTES, MAX_INPUT_PIXELS, MAX_SIDE, TYPES, imageHeader, outputSize, cropRegion, removeEdgeBackground, extractPalette, encodeBmp, exportName } from "./image-core.js";

self.onmessage = async ({data:request}) => {
  let bitmap;
  try {
    const {file,action,settings={}}=request;
    if(!(file instanceof Blob)||!file.size||file.size>MAX_BYTES)throw new Error("Choose one image, up to 20 MB.");
    const header=imageHeader(new Uint8Array(await file.arrayBuffer()));
    if(typeof createImageBitmap!=="function"||typeof OffscreenCanvas!=="function")throw new Error("Local processing is unavailable in this browser. Try a recent Chrome, Edge, Firefox or Safari.");
    bitmap=await createImageBitmap(file);
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>MAX_INPUT_PIXELS)throw new Error("This image exceeds the 24-megapixel input limit.");
    if(action==="inspect"){self.postMessage({ok:true,width:bitmap.width,height:bitmap.height,type:header.type});return;}
    if(!["convert","resize","transparent","crop","compress","rotate","palette"].includes(action))throw new Error("Choose a supported image tool.");
    if(!["resize","crop","palette"].includes(action)&&(bitmap.width>MAX_SIDE||bitmap.height>MAX_SIDE))throw new Error("This source exceeds 4096 pixels per side. Use Image resizer first.");
    if(action==="palette"){
      const scale=Math.min(1,180/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
      const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext("2d",{willReadFrequently:true});
      if(!ctx)throw new Error("Could not read colors from this image.");
      ctx.drawImage(bitmap,0,0,w,h);
      const palette=extractPalette(ctx.getImageData(0,0,w,h).data,Math.min(12,Math.max(2,settings.colors||6)));
      if(!palette.length)throw new Error("This image has no opaque colors to sample.");
      self.postMessage({ok:true,palette,width:bitmap.width,height:bitmap.height});return;
    }
    const crop=action==="crop"?cropRegion(settings.x,settings.y,settings.width,settings.height,bitmap.width,bitmap.height):{x:0,y:0,width:bitmap.width,height:bitmap.height};
    const rotation=action==="rotate"?Number(settings.rotation):0;
    if(![0,90,180,270].includes(rotation))throw new Error("Choose a quarter-turn rotation.");
    const swap=rotation===90||rotation===270;
    const {width,height}=outputSize(action==="resize"?settings.width:swap?crop.height:crop.width,action==="resize"?settings.height:swap?crop.width:crop.height);
    const format=action==="transparent"?"png":settings.format;
    if(!Object.hasOwn(TYPES,format))throw new Error("Choose PNG, JPEG, WebP or BMP.");
    const quality=Number(settings.quality??94)/100;
    if(!Number.isFinite(quality)||quality<.1||quality>1)throw new Error("Choose a quality from 10 to 100.");
    const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext("2d",{willReadFrequently:format==="bmp"});
    if(!ctx)throw new Error("Could not open an image canvas. Try a smaller image.");
    if(format==="jpeg"||format==="bmp"){ctx.fillStyle=settings.matte||"#ffffff";ctx.fillRect(0,0,width,height);}
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
    if(action==="rotate"){
      ctx.translate(width/2,height/2);ctx.rotate(rotation*Math.PI/180);ctx.scale(settings.flipX?-1:1,settings.flipY?-1:1);ctx.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);
    }else ctx.drawImage(bitmap,crop.x,crop.y,crop.width,crop.height,0,0,width,height);
    if(action==="transparent"){const pixels=ctx.getImageData(0,0,width,height);removeEdgeBackground(pixels.data,width,height,settings.color||"#ffffff",settings.tolerance??10);ctx.putImageData(pixels,0,0);}
    const blob=format==="bmp"?encodeBmp(ctx.getImageData(0,0,width,height).data,width,height):await canvas.convertToBlob({type:TYPES[format],quality});
    if(!blob.size||blob.type!==TYPES[format])throw new Error("Your browser cannot export this format. Choose PNG and try again.");
    self.postMessage({ok:true,blob,width,height,format,name:exportName(file.name||"image",action,format)});
  }catch(error){self.postMessage({ok:false,error:error instanceof Error?error.message:"Could not process the image. Try another file."});}
  finally{bitmap?.close();}
};
