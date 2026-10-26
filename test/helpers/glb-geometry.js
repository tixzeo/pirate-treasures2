import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Node has no image decoder. Strip only texture references in a temporary GLB
// copy for geometry/navigation tests; browser smoke tests load the real images.
export async function loadGeometryOnly(url) {
  const data = await readFile(url), length = data.readUInt32LE(12);
  const json = JSON.parse(data.toString('utf8', 20, 20 + length));
  const original = structuredClone(json);
  const strip = object => {
    if (!object || typeof object !== 'object') return;
    for (const key of Object.keys(object)) {
      if (/Texture$/.test(key)) delete object[key]; else strip(object[key]);
    }
  };
  strip(json.materials); delete json.textures; delete json.images; delete json.samplers;
  const text = JSON.stringify(json), padded = Buffer.from(text + ' '.repeat((4 - Buffer.byteLength(text) % 4) % 4));
  const tail = data.subarray(20 + length), copy = Buffer.alloc(20 + padded.length + tail.length);
  copy.writeUInt32LE(0x46546c67, 0); copy.writeUInt32LE(2, 4); copy.writeUInt32LE(copy.length, 8);
  copy.writeUInt32LE(padded.length, 12); copy.writeUInt32LE(0x4e4f534a, 16); padded.copy(copy, 20); tail.copy(copy, 20 + padded.length);
  const root = (await new GLTFLoader().parseAsync(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength), '')).scene;
  return { root, original, data };
}
