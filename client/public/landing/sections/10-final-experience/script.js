(() => {
  'use strict';
  const experience = document.getElementById('final-experience');
  const canvas = document.getElementById('particles');
  const stage = document.getElementById('story-stage');
  const core = document.querySelector('.core-emblem');
  const pauseButton = document.getElementById('toggle-motion');
  const replayButton = document.getElementById('replay');
  const dialog = document.getElementById('memory-dialog');
  const dialogImage = document.getElementById('dialog-image');
  const dialogTitle = document.getElementById('dialog-title');
  const dialogDescription = document.getElementById('dialog-description');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ctx = canvas && canvas.getContext('2d', {alpha:true});
  if (!experience || !canvas || !ctx || !stage || !core) return;

  const stories = {
    friends: {
      title: 'Lifelong friendships', image: './assets/lifelong-friendships.webp',
      description: 'A new city can become familiar when you meet people who share your interests, laugh at the same jokes, and turn an ordinary evening into a new tradition.'
    },
    relationships: {
      title: 'Meaningful relationships', image: './assets/meaningful-relationships.webp',
      description: 'Sometimes the people who matter most are the people you have not met yet. Start with shared interests, and see where genuine connection leads.'
    },
    adventures: {
      title: 'Unforgettable experiences', image: './assets/unforgettable-experiences.webp',
      description: 'That trip you have been talking about, the event you did not want to attend alone, or a weekend somewhere new—all feel different with the right people.'
    },
    creative: {
      title: 'Creative collaborations', image: './assets/creative-collaborations.webp',
      description: 'An idea becomes something real when filmmakers, designers, builders and other creatives find collaborators who want to create alongside them.'
    },
    career: {
      title: 'Career & growth', image: './assets/career-growth.webp',
      description: 'Build a circle of people who exchange ideas, share opportunities, support one another and open doors to the next chapter in their professional lives.'
    },
    create: {
      title: 'Build your own Hive', image: './assets/build-your-hive.webp',
      description: 'Some people are not just looking for a community—they are ready to create one. Bring like-minded people together, lead the experience and build something that lasts.'
    }
  };

  // The three connected hexagons are the actual TrueHive-style mark, not generic circles.
  const hexagons = [
    [[96,10],[139,35],[139,84],[96,109],[53,84],[53,35]],
    [[52,84],[95,109],[95,158],[52,183],[9,158],[9,109]],
    [[140,84],[183,109],[183,158],[140,183],[97,158],[97,109]]
  ];
  const clamp = (x,a,b) => Math.max(a, Math.min(b,x));
  const ease = x => 1 - Math.pow(1 - clamp(x,0,1), 3);
  const mix = (a,b,t) => a + (b-a)*t;
  const random = (min,max) => min + Math.random()*(max-min);

  let width = 1, height = 1, dpr = 1;
  let particles = [], ambient = [];
  let started = false, motionPaused = reducedMotion.matches, visible = true;
  let startTime = 0, elapsed = 0, raf = null;
  let mouse = null, scrollTicking = false;

  // Where the honeycomb mark sits inside the section. Measured from the layout
  // (offsetLeft/offsetTop/offsetWidth), not getBoundingClientRect(), so the
  // entrance zoom (.68 -> 1) and breathing animation never distort the aim.
  // Kept up to date whenever the layout shifts (e.g. web fonts finishing).
  let markBox = { originX:0, originY:0, sizeX:1, sizeY:1 };
  function measureMark() {
    let x = 0, y = 0, el = core;
    while (el && el !== experience) {
      x += el.offsetLeft; y += el.offsetTop;
      const parent = el.offsetParent;
      if (!parent || parent === experience || !experience.contains(parent)) break;
      el = parent;
    }
    markBox = { originX:x, originY:y, sizeX:core.offsetWidth / 192, sizeY:core.offsetHeight / 184 };
  }
  function getHexTargets() { return markBox; }

  // A random point on the mark's outline, in the mark's own 192x184 units, so
  // it can be re-projected whenever the mark moves without restarting anything.
  function pointOnMark() {
    const hex = hexagons[Math.floor(random(0,3))];
    const side = Math.floor(random(0,6));
    const p = hex[side], q = hex[(side+1)%6];
    const portion = Math.random();
    return {mx:mix(p[0],q[0],portion), my:mix(p[1],q[1],portion)};
  }

  function buildParticles() {
    const total = width < 700 ? 260 : width < 1100 ? 440 : 690;
    const ambientTotal = width < 700 ? 150 : 280;
    particles = Array.from({length:total}, (_,i)=>({
      nx:Math.random(), ny:Math.random(),
      angle:random(0,Math.PI*2), speed:random(.6,1.8),
      phase:random(0,Math.PI*2), radius:random(.7,2.3),
      glow:i%11===0, alpha:random(.45,.95),
      delay:random(.4,2.15), jitter:random(.4,1.8), target:pointOnMark()
    }));
    ambient = Array.from({length:ambientTotal}, (_,i)=>({
      nx:Math.random(),ny:Math.random(),r:random(.45,2.05),
      drift:random(4,17),phase:random(0,Math.PI*2),alpha:random(.22,.75),
      glow:i%16===0
    }));
  }

  // Match the canvas to the section and re-aim at the mark. Particles keep
  // their motion; they simply converge on the mark's current position.
  function fitCanvas() {
    const rect = experience.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    canvas.width = Math.round(width*dpr);
    canvas.height = Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    measureMark();
  }

  function resize() {
    fitCanvas();
    buildParticles();
    if (motionPaused) draw(elapsed);
  }

  // Layout can shift after the first measurement — most often when the web
  // fonts arrive and the headline re-wraps. Re-aim without rebuilding.
  function relayout() {
    const rect = experience.getBoundingClientRect();
    if (Math.round(rect.width) !== width || Math.round(rect.height) !== height) fitCanvas();
    else measureMark();
    if (motionPaused) draw(elapsed);
  }

  function drawDot(x,y,r,alpha,glow) {
    if (glow) {
      const gr = ctx.createRadialGradient(x,y,0,x,y,Math.max(8,r*7));
      gr.addColorStop(0,`rgba(255,216,141,${alpha*.7})`);
      gr.addColorStop(.3,`rgba(248,174,65,${alpha*.28})`);
      gr.addColorStop(1,'rgba(235,143,48,0)');
      ctx.fillStyle=gr;ctx.beginPath();ctx.arc(x,y,Math.max(8,r*7),0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle=`rgba(255,${Math.round(mix(174,227,Math.min(1,alpha)))},${Math.round(mix(77,155,alpha))},${clamp(alpha,0,1)})`;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }

  function draw(t) {
    ctx.clearRect(0,0,width,height);
    // Gold embers drift across the entire scene—subtle even after the entrance.
    for(const p of ambient){
      let x=p.nx*width + Math.sin(t*.17+p.phase)*p.drift;
      let y=p.ny*height + Math.cos(t*.12+p.phase)*p.drift;
      const twinkle=.69+.31*Math.sin(t*1.15+p.phase);
      if(mouse) {const d=Math.hypot(x-mouse.x,y-mouse.y);if(d<145){const push=(145-d)/145;x+=(mouse.x-x)*push*.075;y+=(mouse.y-y)*push*.075;}}
      drawDot(x,y,p.r,p.alpha*twinkle,p.glow);
    }
    // Each dot starts anywhere in the frame and converges on the edges of
    // the three connected TrueHive hexagons. Afterward it keeps shimmering.
    for(const p of particles){
      const progress = motionPaused && !started ? 1 : ease((t-p.delay)/4.2);
      const sx = p.nx*width, sy=p.ny*height;
      const tx = markBox.originX + p.target.mx*markBox.sizeX + Math.sin(t*p.speed+p.phase)*p.jitter;
      const ty = markBox.originY + p.target.my*markBox.sizeY + Math.cos(t*p.speed*.75+p.phase)*p.jitter;
      const x=mix(sx,tx,progress),y=mix(sy,ty,progress);
      const shimmer=.76+.24*Math.cos(t*1.8+p.phase);
      const opacity=p.alpha*shimmer*(.5+.5*progress);
      drawDot(x,y,p.radius*(.7+.3*progress),opacity,p.glow);
    }
    // Sweeping bright points circle the living central mark long after convergence.
    if(t>3){
      const {originX,originY,sizeX,sizeY}=getHexTargets();
      const cx=originX+96*sizeX, cy=originY+95*sizeY;
      const size=Math.min(width/2,235);
      for(let i=0;i<9;i++){
        const angle=t*(i%2 ? .24 : -.18)+i*Math.PI*2/9;
        const x=cx+Math.cos(angle)*size*(.8+(i%3)*.1);
        const y=cy+Math.sin(angle)*size*.75;
        drawDot(x,y,1.0+i%3*.35,(Math.sin(t*.6+i)+1)*.22+.23,i%3===0);
      }
    }
  }

  function tick(now){
    if (!started || motionPaused || !visible || document.hidden){raf=null;return;}
    elapsed = Math.max(0,(now-startTime)/1000);
    draw(elapsed);
    raf = window.requestAnimationFrame(tick);
  }
  function stop(){if(raf!=null){window.cancelAnimationFrame(raf);raf=null;}}
  function resume(){if(!started || motionPaused || !visible || document.hidden)return;stop();startTime=performance.now()-elapsed*1000;raf=requestAnimationFrame(tick);}
  function syncSVG(){
    document.querySelectorAll('.thread-map').forEach(svg=>{
      try{if(motionPaused || reducedMotion.matches)svg.pauseAnimations();else svg.unpauseAnimations();}catch(_error){}
    });
  }
  function setPaused(value){
    motionPaused=!!value;
    experience.classList.toggle('paused',motionPaused);
    pauseButton.setAttribute('aria-pressed',String(motionPaused));
    pauseButton.title=motionPaused?'Resume animation':'Pause animation';
    pauseButton.querySelector('span').textContent=motionPaused?'Resume motion':'Pause motion';
    pauseButton.querySelector('svg').innerHTML=motionPaused?'<path d="m8 5 11 7-11 7Z"/>':'<path d="M8 5v14M16 5v14"/>';
    syncSVG();
    if(motionPaused){stop();draw(started?elapsed:15);}else{resume();}
  }
  function start(){
    if(started)return;
    started=true;startTime=performance.now();elapsed=0;
    experience.classList.add('started');
    if(reducedMotion.matches){elapsed=15;setPaused(true);}else{resume();}
  }
  function replay(){
    started=false;stop();elapsed=0;
    experience.classList.remove('started');
    // Force restart only of the existing CSS animations; never refresh the page.
    void experience.offsetHeight;
    start();
    if(motionPaused)draw(15);
  }

  for(const button of document.querySelectorAll('[data-memory]')){
    button.addEventListener('click',()=>{
      const story=stories[button.dataset.memory];if(!story)return;
      dialogImage.src=story.image;
      dialogImage.alt=button.querySelector('img')?.alt || '';
      dialogTitle.textContent=story.title;
      dialogDescription.textContent=story.description;
      if(typeof dialog.showModal==='function')dialog.showModal();
      else dialog.setAttribute('open','');
    });
  }
  document.getElementById('close-dialog').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  pauseButton.addEventListener('click',()=>setPaused(!motionPaused));
  replayButton.addEventListener('click',replay);
  experience.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch')return;
    const rect=experience.getBoundingClientRect();
    mouse={x:event.clientX-rect.left,y:event.clientY-rect.top};
  },{passive:true});
  experience.addEventListener('pointerleave',()=>mouse=null);
  window.addEventListener('resize',()=>{if(!scrollTicking){scrollTicking=true;requestAnimationFrame(()=>{scrollTicking=false;resize();});}},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else resume();});
  reducedMotion.addEventListener?.('change',event=>setPaused(event.matches));
  resize();
  // Re-aim once the web fonts have loaded, and whenever the section's layout
  // changes size (e.g. the headline re-wrapping on a phone).
  document.fonts?.ready?.then(relayout);
  if('ResizeObserver' in window){
    let layoutTicking=false;
    new ResizeObserver(()=>{if(!layoutTicking){layoutTicking=true;requestAnimationFrame(()=>{layoutTicking=false;relayout();});}}).observe(experience);
  }
  setPaused(motionPaused);
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(entry.isIntersecting){visible=true;start();resume();}
        else {visible=false;stop();}
      }
    },{threshold:.12});
    observer.observe(experience);
  }else{visible=true;start();}
})();
