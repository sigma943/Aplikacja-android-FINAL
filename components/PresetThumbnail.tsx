import {INTERFACE_PRESETS} from '@/lib/interface-presets';
import {presetThumbnailSource} from '@/lib/preset-thumbnail';

const sources=new Map(INTERFACE_PRESETS.map(preset=>[preset.name,{normal:presetThumbnailSource(preset),compact:presetThumbnailSource(preset,true)}]));
export default function PresetThumbnail({name}:{name:string}) {
  const image=sources.get(name)!;
  return <picture className="personal-preset-preview" aria-hidden="true">
    <source media="(max-width:360px)" srcSet={image.compact}/>
    {/* One decoded image replaces independently composited sibling backgrounds. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={image.normal} alt="" draggable={false} decoding="sync"/>
  </picture>;
}
