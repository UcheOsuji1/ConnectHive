'use strict';

// TrueHive — Section 09. All people/stories are illustrative, not verified testimonials.
// Replace `image` paths with real community photography later; see README.md.
const stories = [
  {
    id:'new-city', type:'free', category:'NEW IN TOWN', title:'New city. A new circle.',
    quote:'“I moved to a new city and wanted somewhere I could belong.”',
    image:'assets/01-new-city.webp', alt:'Five young adults laughing together over dinner on a Los Angeles rooftop at sunset.',
    hive:'LA Newcomers Club', situation:'A new city, unfamiliar faces, and a desire to meet people.',
    outcome:'A welcoming group and more reasons to get out and explore.',
    lead:'Imagine moving somewhere new and discovering a circle of people who want to share dinners, explore the city, and build real friendships.',
    imagePosition:'50% 50%'
  },
  {
    id:'filmmakers', type:'free', category:'FILMMAKERS', title:'Find your creative crew.',
    quote:'“I had the story. I just needed people to help bring it to life.”',
    image:'assets/02-filmmakers.webp', alt:'Four filmmakers planning a scene with a professional cinema camera in a production studio.',
    hive:'The Filmmakers Collective', situation:'A short-film idea without the cast and crew to make it.',
    outcome:'A space to meet actors, editors, and collaborators.',
    lead:'Picture a filmmaking group where creatives can find each other, share ideas, organize shoots, and turn independent projects into something real.',
    imagePosition:'52% 50%'
  },
  {
    id:'miami', type:'free', category:'TRAVEL CREW', title:'The trip that finally happened.',
    quote:'“We kept talking about Miami. What we really needed was our crew.”',
    image:'assets/03-miami-travel.webp', alt:'Four friends smiling and walking together near the beach and palm trees in Miami.',
    hive:'Miami Travel Crew', situation:'A trip to Miami that never seemed to make it out of the group chat.',
    outcome:'A travel crew to plan, explore, and make memories with.',
    lead:'Imagine finding people who want the same trip, the same energy, and the same adventure—then turning a group conversation into actual travel plans.',
    imagePosition:'51% 50%'
  },
  {
    id:'startup', type:'free', category:'BUILD TOGETHER', title:'From idea to collaboration.',
    quote:'“I wanted to build something. I didn’t want to build it alone.”',
    image:'assets/04-startup-builders.webp', alt:'Four young collaborators discussing an idea around laptop computers in a bright shared workspace.',
    hive:'Startup Builders', situation:'An ambitious product idea and a search for people with complementary skills.',
    outcome:'A community to trade feedback, recruit teammates, and build.',
    lead:'Imagine meeting designers, developers, and future founders who are just as excited to create, experiment, and turn ambitious ideas into products.',
    imagePosition:'50% 50%'
  },
  {
    id:'wellness', type:'free', category:'SHARED GOALS', title:'A reason to keep going.',
    quote:'“Keeping up with my goals felt easier when I had people with me.”',
    image:'assets/05-wellness.webp', alt:'Five friends chatting after a workout in a green, sunlit park.',
    hive:'The Wellness Circle', situation:'A fitness goal that is hard to maintain alone.',
    outcome:'A running and wellness crew for encouragement and accountability.',
    lead:'Picture a space where people schedule runs, celebrate personal milestones, and show up for each other—one workout at a time.',
    imagePosition:'50% 50%'
  },
  {
    id:'creative-paid', type:'paid', category:'CREATOR COMMUNITY', title:'Create a space worth joining.',
    quote:'“I wanted a home for my workshops, resources, and creative community.”',
    image:'assets/06-creative-paid.webp', alt:'Creative professionals planning an exclusive collaborative workshop around a table.',
    hive:'The Creator’s Studio', situation:'A creative host wants to bring workshop attendees together in one place.',
    outcome:'A paid membership Hive with workshops and members-only resources.',
    lead:'Imagine a creator building a member-supported home for live workshops, creative discussions, special events, and exclusive resources.',
    imagePosition:'52% 50%'
  },
  {
    id:'mentorship-paid', type:'paid', category:'EXCLUSIVE MENTORSHIP', title:'Turn experience into community.',
    quote:'“I wanted to share what I’ve learned with people ready to grow.”',
    image:'assets/07-mentorship-paid.webp', alt:'An experienced professional leading a small mentorship discussion around a modern meeting table.',
    hive:'The Founder’s Circle', situation:'An experienced mentor has insight to offer but needs a dedicated community.',
    outcome:'A paid Hive for group mentoring and exclusive learning sessions.',
    lead:'Imagine building a curated learning community where members can attend private discussions, ask questions, and learn from shared expertise.',
    imagePosition:'50% 48%'
  },
  {
    id:'social-paid', type:'paid', category:'MEMBERS-ONLY CLUB', title:'A more intentional social circle.',
    quote:'“We wanted something more personal than another crowded group chat.”',
    image:'assets/08-social-club-paid.webp', alt:'Women enjoying a small, comfortable book club discussion in a stylish living room.',
    hive:'The Social Society', situation:'A social club organizer wants to host meaningful, recurring gatherings.',
    outcome:'A members-only Hive for curated conversations and private events.',
    lead:'Imagine a paid social club where members join curated book discussions, private gatherings, and thoughtful community experiences.',
    imagePosition:'50% 50%'
  }
];

const stage = document.getElementById('stories-stage');
const canvasCards = document.getElementById('card-canvas');
const dots = document.getElementById('carousel-dots');
const modal = document.getElementById('story-modal');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = { filter:'all', currentId:'miami', paused:reducedMotion.matches, hovered:false, modalOpen:false, inView:true, lastFocus:null };
let visibleStories = [];
let cardElements = new Map();

const ICONS = {
  free:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7l9-5Z"/></svg>',
  paid:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 8 5 5 5-9 5 9 5-5-2 12H4L2 8Z"/></svg>',
  arrow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>'
};

function itemsFor(filter) { return stories.filter(s => filter==='all' || s.type===filter); }
function activeIndex() { return Math.max(0, visibleStories.findIndex(s=>s.id===state.currentId)); }
function cycleSignedDiff(index, current, count) {
  let diff = (index-current+count)%count;
  if(diff>count/2) diff-=count;
  if(count===4 && diff===2) diff=-2;
  return diff;
}
function storyCardMarkup(story) {
  // All content here is authored in this file, not input from visitors.
  return `
    <img src="${story.image}" alt="${story.alt}" style="object-position:${story.imagePosition}">
    <div class="card-top">
      <span class="story-tag">${story.type==='paid'?ICONS.paid:ICONS.free}<span>${story.category}</span></span>
      <span class="story-kind ${story.type}">${story.type==='paid'?'✦ PAID':''}</span>
    </div>
    <div class="card-bottom">
      <div class="card-label">${story.title}</div>
      <p class="card-quote">${story.quote}</p>
      <div class="card-meta"><span class="card-hive"><span class="card-minihex">${story.type==='paid'?ICONS.paid:ICONS.free}</span><span>${story.hive}</span></span><span class="story-type">${story.type==='paid'?'PAID HIVE':'FREE HIVE'}</span></div>
      <span class="card-disclosure">ILLUSTRATIVE SCENARIO</span>
    </div>`;
}
function createCards() {
  visibleStories=itemsFor(state.filter);
  if(!visibleStories.some(s=>s.id===state.currentId)) state.currentId=visibleStories[Math.min(2,visibleStories.length-1)].id;
  canvasCards.replaceChildren();
  cardElements.clear();
  visibleStories.forEach((s, i)=>{
    const card=document.createElement('button');
    card.type='button'; card.className='story-card'; card.dataset.id=s.id;
    card.setAttribute('aria-label',`Explore illustrative story ${i+1} of ${visibleStories.length}: ${s.title} (${s.type} Hive)`);
    card.innerHTML=storyCardMarkup(s);
    card.addEventListener('click',()=>{
      if(state.currentId===s.id) { openModal(); return; }
      selectStory(s.id);
    });
    canvasCards.append(card);cardElements.set(s.id,card);
  });
  createDots();
  positionCards();
}
function createDots() {
  dots.replaceChildren();
  visibleStories.forEach((s,idx)=>{
    const button=document.createElement('button');
    button.type='button';button.setAttribute('aria-label',`Show story ${idx+1}: ${s.title}`);
    button.dataset.id=s.id;
    button.addEventListener('click',()=>selectStory(s.id));
    dots.append(button);
  });
}
function positionCards() {
  const current=activeIndex(),total=visibleStories.length;
  visibleStories.forEach((s,i)=>{
    const card=cardElements.get(s.id);
    if(!card) return;
    const diff=cycleSignedDiff(i,current,total);
    const abs=Math.abs(diff);
    const side=diff<0?-1:1;
    const pos=abs===0?'center':abs===1?'near':abs===2?'far':'hidden';
    card.dataset.position=pos;
    const space=abs===0?'0px':abs===1?`calc(${side} * var(--card-step-1))`:`calc(${side} * var(--card-step-2))`;
    card.style.setProperty('--space',space);
    card.style.setProperty('--scale',abs===0?1:abs===1?.88:.74);
    card.style.setProperty('--z',abs===0?10:abs===1?6:abs===2?3:1);
    card.style.setProperty('--rotate',abs===0?'0deg':`${-side*(abs===1?5:9)}deg`);
    card.style.setProperty('--offset-y',abs===0?'0px':abs===1?'8px':'18px');
    card.style.setProperty('--opacity',abs>2?0:abs===2?.72:1);
    card.setAttribute('aria-hidden',abs>2?'true':'false');
    card.tabIndex=abs>2?-1:0;
  });
  document.querySelectorAll('.carousel-dots button').forEach((b,i)=>{
    const active=i===current;
    b.classList.toggle('is-active',active);
    b.setAttribute('aria-current',active?'true':'false');
  });
  document.getElementById('story-counter-current').textContent=String(current+1).padStart(2,'0');
  document.getElementById('story-counter-total').textContent=String(total).padStart(2,'0');
  const s=visibleStories[current];
  document.getElementById('step-situation').textContent=s.situation;
  document.getElementById('step-hive').textContent=s.hive;
  document.getElementById('step-outcome').textContent=s.outcome;
  document.getElementById('read-story').setAttribute('aria-label',`Explore: ${s.title}`);
  stage.dataset.selectedType=s.type;
  stage.classList.remove('is-shifting');
  // restart a subtle gold glint each time a featured card changes
  void stage.offsetWidth;
  stage.classList.add('is-shifting');
}
function selectStory(id) {
  if(!visibleStories.some(s=>s.id===id)) return;
  state.currentId=id;
  positionCards();
  if(state.modalOpen) updateModal();
}
function move(direction) {
  const index=activeIndex();
  const next=(index+direction+visibleStories.length)%visibleStories.length;
  selectStory(visibleStories[next].id);
}
function filterStories(filter){
  if(!['all','free','paid'].includes(filter)) return;
  const was=state.currentId;
  state.filter=filter;
  if(!itemsFor(filter).some(s=>s.id===was)) state.currentId=(filter==='paid'?'creative-paid':'miami');
  document.querySelectorAll('.filter').forEach(button=>{
    const on=button.dataset.filter===filter;
    button.classList.toggle('is-active',on);button.setAttribute('aria-pressed',String(on));
  });
  createCards();
}

const modalNodes={
  image:document.getElementById('modal-image'),kind:document.getElementById('modal-kind'),title:document.getElementById('modal-title'),lead:document.getElementById('modal-lead'),situation:document.getElementById('modal-situation'),hive:document.getElementById('modal-hive'),outcome:document.getElementById('modal-outcome')
};
function updateModal() {
  const s=visibleStories[activeIndex()];
  modalNodes.image.src=s.image;
  modalNodes.image.alt=s.alt;
  modalNodes.kind.textContent=(s.type==='paid'?'PAID HIVE':'FREE HIVE')+' · ILLUSTRATIVE EXPERIENCE';
  modalNodes.title.textContent=s.title;
  modalNodes.lead.textContent=s.lead;
  modalNodes.situation.textContent=s.situation;
  modalNodes.hive.textContent=s.hive;
  modalNodes.outcome.textContent=s.outcome;
}
function openModal() {
  if(state.modalOpen) return;
  state.modalOpen=true;
  state.lastFocus=document.activeElement;
  updateModal();
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  document.getElementById('modal-close').focus();
}
function closeModal() {
  if(!state.modalOpen) return;
  state.modalOpen=false;modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');
  const target=state.lastFocus;
  if(target && target.isConnected && typeof target.focus==='function') target.focus();
  else document.getElementById('read-story').focus();
}

// Controls
for(const button of document.querySelectorAll('.filter')) button.addEventListener('click',()=>filterStories(button.dataset.filter));
document.getElementById('previous-story').addEventListener('click',()=>move(-1));
document.getElementById('next-story').addEventListener('click',()=>move(1));
document.getElementById('read-story').addEventListener('click',openModal);
document.getElementById('modal-next').addEventListener('click',()=>move(1));
document.getElementById('modal-close').addEventListener('click',closeModal);
modal.querySelector('[data-close-modal]').addEventListener('click',closeModal);
stage.addEventListener('mouseenter',()=>{state.hovered=true;});
stage.addEventListener('mouseleave',()=>{state.hovered=false;});
let pointerDown=null;
stage.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse' || e.button===0) pointerDown={x:e.clientX,y:e.clientY};});
stage.addEventListener('pointerup',e=>{
  if(!pointerDown) return;
  const dx=e.clientX-pointerDown.x, dy=e.clientY-pointerDown.y;
  pointerDown=null;
  if(Math.abs(dx)>65 && Math.abs(dx)>Math.abs(dy)*1.25){move(dx<0?1:-1);stage.dataset.swiped=String(Date.now());}
});
// Dragging a carousel should not accidentally open its featured story.
canvasCards.addEventListener('click',e=>{
  if(!stage.dataset.swiped) return;
  if(Date.now()-Number(stage.dataset.swiped)<360){e.stopImmediatePropagation();e.preventDefault();}
},true);
const autoButton=document.getElementById('autoplay-toggle');
function syncPauseButton(){
  autoButton.setAttribute('aria-pressed',String(state.paused));
  autoButton.setAttribute('aria-label',state.paused?'Resume automatic story rotation':'Pause automatic story rotation');
  document.getElementById('autoplay-label').textContent=state.paused?'Play':'Pause';
  autoButton.querySelector('svg').innerHTML=state.paused?'<path d="m9 5 10 7-10 7V5Z"/>':'<path d="M8 5v14M16 5v14"/>';
}
autoButton.addEventListener('click',()=>{state.paused=!state.paused;syncPauseButton();});
document.addEventListener('keydown',e=>{
  if(state.modalOpen){
    if(e.key==='Escape'){e.preventDefault();closeModal();}
    if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}
    if(e.key==='ArrowRight'){e.preventDefault();move(1);}
    // Keep keyboard focus within the dialog while it is open.
    if(e.key==='Tab'){
      const focusable=[...modal.querySelectorAll('button:not([disabled])')].filter(el=>el.offsetParent!==null);
      const first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
    }
  } else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
    if(!document.getElementById('truehive-stories').contains(document.activeElement)) return;
    if(document.activeElement && document.activeElement.matches('.filter')) return;
    e.preventDefault();move(e.key==='ArrowRight'?1:-1);
  }
});
const observer=new IntersectionObserver(entries=>{state.inView=entries[0].isIntersecting;},{threshold:.06});
observer.observe(document.getElementById('truehive-stories'));
setInterval(()=>{
  if(!state.paused && !state.hovered && !state.modalOpen && !document.hidden && state.inView && !document.getElementById('truehive-stories').contains(document.activeElement)) move(1);
},9000);

// A subtle gold/bronze particle atmosphere. No remote libraries or assets.
const particleCanvas=document.getElementById('gold-canvas');
const ctx=particleCanvas.getContext('2d',{alpha:true});
let particles=[];let width=0,height=0,lastFrame=0;
let seed=73921;
function rand(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646;}
function resetCanvas(){
  if(!ctx) return;
  const bounds=particleCanvas.getBoundingClientRect();
  const dpr=Math.min(window.devicePixelRatio||1,1.75);
  width=bounds.width;height=bounds.height;
  particleCanvas.width=Math.max(1,Math.round(width*dpr));particleCanvas.height=Math.max(1,Math.round(height*dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const count=Math.min(220,Math.round(width*height/10500));
  particles=Array.from({length:count},()=>({x:rand()*width,y:rand()*height,rad:.4+rand()*1.35,alpha:.13+rand()*.48,speed:.018+rand()*.07,t:rand()*Math.PI*2}));
}
function drawParticles(timestamp){
  requestAnimationFrame(drawParticles);
  if(!ctx||document.hidden||!state.inView) return;
  if(timestamp-lastFrame < (reducedMotion.matches?95:30)) return;
  const dt=Math.min(55,timestamp-lastFrame||33);lastFrame=timestamp;
  ctx.clearRect(0,0,width,height);
  particles.forEach((p,i)=>{
    if(!reducedMotion.matches){p.y-=p.speed*dt*.4;p.x+=Math.sin(timestamp*.00026+p.t)*.18;}
    if(p.y<0)p.y=height;if(p.x>width)p.x=0;if(p.x<0)p.x=width;
    const pulse=.7+.3*Math.sin(timestamp*.0015+p.t);
    const a=p.alpha*pulse;
    ctx.beginPath();ctx.arc(p.x,p.y,p.rad,0,Math.PI*2);
    ctx.fillStyle=`rgba(245,173,73,${a})`;ctx.fill();
    if(i%23===0){
      ctx.beginPath();ctx.arc(p.x,p.y,p.rad*4,0,Math.PI*2);
      ctx.fillStyle=`rgba(231,150,48,${a*.045})`;ctx.fill();
    }
  });
}
window.addEventListener('resize',resetCanvas,{passive:true});
resetCanvas();requestAnimationFrame(drawParticles);
createCards();syncPauseButton();
