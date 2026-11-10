/* Normalize icon definitions into genuine SVG namespace geometry.
   Some embedded HTML contexts parse self-closing icon shapes as HTML nodes.
   The icons are original local symbols; no third-party assets or requests. */
(function () {
  'use strict';
  const ns='http://www.w3.org/2000/svg';
  const shapes=new Set(['path','rect','circle','line','polyline','polygon','ellipse']);
  document.querySelectorAll('svg use[href^="#i-"]').forEach(use=>{
    const id=use.getAttribute('href');
    if (!/^#i-[a-z0-9-]+$/.test(id||'')) return;
    const symbol=document.getElementById(id.slice(1));
    const svg=use.parentElement;
    if (!symbol || !svg) return;
    svg.setAttribute('viewBox',symbol.getAttribute('viewBox')||'0 0 24 24');
    // A flat list handles HTML-parser nesting of erroneously self-closed shapes.
    symbol.querySelectorAll('path,rect,circle,line,polyline,polygon,ellipse').forEach(source=>{
      const tag=source.localName;
      if(!shapes.has(tag)) return;
      const node=document.createElementNS(ns,tag);
      for(const attr of Array.from(source.attributes))node.setAttribute(attr.name,attr.value);
      svg.insertBefore(node,use);
    });
    use.remove();
  });
})();
