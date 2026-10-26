// The supplied floating barrels have their stave triangles wound inward.
// Correct only that shell, leaving intentional gaps, hoops and lids unchanged.
export function prepareWaterModel(root, kind) {
  if (kind !== 'barrel_intact' && kind !== 'barrel_damaged') return;
  const shell = root.getObjectByName('Barrel_Stave_Body');
  if (!shell?.isMesh) throw new Error(`${kind}: missing stave shell`);
  const geometry = shell.geometry.clone(), p = geometry.attributes.position;
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(shell.position.clone().set(0,0,0));
  const order = geometry.index ? Array.from(geometry.index.array) : Array.from({length:p.count},(_,i)=>i);
  let inward = 0, outward = 0;
  for (let i=0;i<order.length;i+=3) {
    const a=order[i],b=order[i+1],c=order[i+2];
    const ux=p.getX(b)-p.getX(a),uy=p.getY(b)-p.getY(a),uz=p.getZ(b)-p.getZ(a);
    const vx=p.getX(c)-p.getX(a),vy=p.getY(c)-p.getY(a),vz=p.getZ(c)-p.getZ(a);
    const x=(p.getX(a)+p.getX(b)+p.getX(c))/3-center.x,z=(p.getZ(a)+p.getZ(b)+p.getZ(c))/3-center.z;
    const dot=(uy*vz-uz*vy)*x+(ux*vy-uy*vx)*z;
    if(dot < -1e-8) inward++; else if(dot > 1e-8) outward++;
  }
  if (inward > outward) {
    for(let i=0;i<order.length;i+=3)[order[i+1],order[i+2]]=[order[i+2],order[i+1]];
    geometry.setIndex(order); geometry.computeVertexNormals(); shell.geometry = geometry;
  } else geometry.dispose();
}
