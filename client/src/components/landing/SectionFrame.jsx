import { useEffect, useRef, useState } from 'react';

// Each original section is a full standalone page shown in its own iframe, so
// its CSS and JS can't collide with the others. The section files are never
// edited. Instead, this wrapper corrects, from the outside, the few things that
// behave differently inside an iframe than in a normal browser tab:
//
// 1. Height: the frame is sized to the section's real content.
// 2. Viewport units (vh/svh/dvh/lvh) mean "the iframe's height". Because we
//    grow the iframe to fit its content, `min-height:100vh` would grow forever.
//    We pin them to the real browser window height instead.
// 3. Pop-ups (`position:fixed` elements and modal <dialog>s) are placed
//    relative to the whole iframe, so a "centered" pop-up lands in the middle
//    of a tall section, often off screen. We keep them over the visible part.
// 4. Links to other pages would load inside the small frame. Links to pages of
//    this app go through React Router (no full reload); outside links open in
//    the whole browser tab. A link marked `data-th-action="…"` is handed to the
//    landing page instead (e.g. Find Your Hive, or scrolling to a section).

// ---------- 1. Height ----------
function measure(frame) {
  const doc = frame.contentDocument;
  if (!doc || !doc.body) return null;
  // Use the bottom edge of the visible top-level content. Don't use the
  // document's scrollHeight: it is never smaller than the iframe itself, so the
  // frame could only ever grow and never shrink to fit.
  const win = doc.defaultView;
  const children = [...doc.body.children].filter((el) => {
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'NOSCRIPT', 'DIALOG'].includes(el.tagName)) return false;
    const cs = win.getComputedStyle(el);
    return cs.display !== 'none' && cs.position !== 'fixed';
  });
  if (!children.length) return Math.max(350, doc.body.scrollHeight);
  const bottom = Math.max(
    ...children.map((el) => el.getBoundingClientRect().bottom + win.scrollY + parseFloat(win.getComputedStyle(el).marginBottom || 0))
  );
  const bodyPad = parseFloat(win.getComputedStyle(doc.body).paddingBottom || 0) +
    parseFloat(win.getComputedStyle(doc.body).marginBottom || 0);
  return Math.max(350, Math.ceil(bottom + bodyPad));
}

// ---------- 2 & 3. Viewport units and pop-ups ----------
const VH_UNIT_RE = /(-?\d*\.?\d+)(?:s|l|d)?vh\b/g;

function walkRules(doc, visit) {
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules) walk(rule.cssRules); // @media, @supports, etc.
      if (rule.style) visit(rule);
    }
  };
  for (const sheet of doc.styleSheets) {
    try { walk(sheet.cssRules); } catch { /* cross-origin sheet */ }
  }
}

function collectRules(doc) {
  const vh = [];
  const fixed = [];
  walkRules(doc, (rule) => {
    const style = rule.style;
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      const value = style.getPropertyValue(prop);
      if (VH_UNIT_RE.test(value)) {
        vh.push({ style, prop, value, priority: style.getPropertyPriority(prop) });
      }
      VH_UNIT_RE.lastIndex = 0;
    }
    if (style.getPropertyValue('position').trim() === 'fixed') {
      const top = style.getPropertyValue('top').trim();
      const bottom = style.getPropertyValue('bottom').trim();
      fixed.push({
        style,
        top: top && top !== 'auto' ? top : null,
        bottom: bottom && bottom !== 'auto' ? bottom : null,
      });
    }
  });
  // Modal <dialog>s are positioned by the browser's own stylesheet, which we
  // can't edit, so they get a small override stylesheet of their own.
  let dialogStyle = null;
  if (doc.querySelector('dialog')) {
    dialogStyle = doc.createElement('style');
    dialogStyle.setAttribute('data-truehive-wrapper', '');
    doc.head.appendChild(dialogStyle);
  }
  return { vh, fixed, dialogStyle };
}

function pinViewportUnits(vhRules) {
  const vh = window.innerHeight / 100;
  for (const r of vhRules) {
    const next = r.value.replace(VH_UNIT_RE, (_, n) => `${Math.round(parseFloat(n) * vh)}px`);
    r.style.setProperty(r.prop, next, r.priority);
  }
}

function placeFixedElements(frame, rules, last) {
  if (!rules.fixed.length && !rules.dialogStyle) return;
  const rect = frame.getBoundingClientRect();
  const winH = window.innerHeight;
  if (rect.bottom < 0 || rect.top > winH) return; // off screen: nothing to show
  // The slice of the iframe that is currently visible acts as its "screen".
  // (A pop-up can't draw outside its iframe, so this is the best placement.)
  const top = Math.round(Math.max(0, -rect.top));
  const bottom = Math.round(Math.max(0, rect.height - (winH - rect.top)));
  if (last.top === top && last.bottom === bottom) return;
  last.top = top;
  last.bottom = bottom;
  for (const r of rules.fixed) {
    if (r.top) r.style.setProperty('top', `calc(${r.top} + ${top}px)`);
    if (r.bottom) r.style.setProperty('bottom', `calc(${r.bottom} + ${bottom}px)`);
  }
  if (rules.dialogStyle) {
    const visible = Math.max(0, rect.height - top - bottom);
    rules.dialogStyle.textContent =
      `dialog:modal{top:${top}px!important;bottom:${bottom}px!important;` +
      `max-height:calc(${visible}px - 6px - 2em)!important}`;
  }
}

// ---------- 4. Links ----------
function openLinksInWholeTab(doc, handlersRef) {
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const link = e.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download')) return;
    const action = link.getAttribute('data-th-action');
    if (action && handlersRef.current.onAction) {
      e.preventDefault();
      handlersRef.current.onAction(action, link);
      return;
    }
    const url = new URL(link.href, doc.baseURI);
    const here = new URL(doc.URL);
    // Links within the same section (e.g. "#details") keep working as before.
    if (url.origin === here.origin && url.pathname === here.pathname && url.search === here.search) return;
    e.preventDefault();
    if (link.target === '_blank') window.open(url.href, '_blank', 'noopener');
    else if (url.origin === window.location.origin && handlersRef.current.onNavigate) {
      handlersRef.current.onNavigate(url.pathname + url.search + url.hash);
    } else window.location.assign(url.href);
  };
  doc.addEventListener('click', onClick);
  return () => doc.removeEventListener('click', onClick);
}

export default function SectionFrame({ id, src, title, label, background, loadWhenVisible = false, placeholderHeight = 1200, injectCss, onAction, onNavigate }) {
  const sectionRef = useRef(null);
  const frameRef = useRef(null);
  // Kept in a ref so new handler functions on re-render don't reload the frame.
  const handlersRef = useRef({ onAction, onNavigate });
  handlersRef.current = { onAction, onNavigate };
  const [active, setActive] = useState(!loadWhenVisible);

  // Optionally wait until the visitor scrolls near this section before loading it.
  useEffect(() => {
    if (active) return;
    const el = sectionRef.current;
    if (!el || !('IntersectionObserver' in window)) { setActive(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setActive(true); io.disconnect(); }
    }, { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [active]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !active) return;
    let lastHeight = 0;
    let observer;
    let rules = { vh: [], fixed: [], dialogStyle: null };
    const lastFixed = {};
    let scrollQueued = false;
    const cleanups = [];

    const placeFixed = () => {
      scrollQueued = false;
      try {
        placeFixedElements(frame, rules, lastFixed);
      } catch (err) {
        console.warn('TrueHive pop-up positioning failed:', err);
      }
    };
    const onScroll = () => {
      if (!scrollQueued) {
        scrollQueued = true;
        requestAnimationFrame(placeFixed);
      }
    };

    const resize = () => {
      try {
        pinViewportUnits(rules.vh);
        const h = measure(frame);
        if (h && Math.abs(lastHeight - h) > 2) {
          lastHeight = h;
          frame.style.height = `${h}px`;
        }
        lastFixed.top = lastFixed.bottom = undefined;
        placeFixed();
      } catch (err) {
        console.warn('TrueHive section sizing failed:', err);
      }
    };

    const onLoad = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      cleanups.splice(0).forEach((fn) => fn());
      if (injectCss && !doc.querySelector('style[data-th-inject]')) {
        const extra = doc.createElement('style');
        extra.setAttribute('data-th-inject', '');
        extra.textContent = injectCss;
        doc.head.appendChild(extra);
      }
      rules = collectRules(doc);
      cleanups.push(openLinksInWholeTab(doc, handlersRef));
      resize();
      if ('ResizeObserver' in window) {
        observer?.disconnect();
        observer = new ResizeObserver(resize);
        observer.observe(doc.body);
        doc.querySelectorAll('body > section, body > main').forEach((el) => observer.observe(el));
      }
      doc.fonts?.ready?.then(resize);
      for (const img of doc.images) {
        if (!img.complete) img.addEventListener('load', resize, { once: true });
      }
      // When we change the frame's height to fit its content, the section sees
      // a window "resize" that never happens on a standalone page. Scripts that
      // re-measure on resize (e.g. Section 10's particle honeycomb, mid-entrance)
      // then lock onto wrong sizes. Hide height-only resizes from the section;
      // real width changes (the visitor resizing the browser) still go through.
      // Capture listeners on the window run before the section's own listeners.
      const win = frame.contentWindow;
      if (win) {
        let lastWidth = win.innerWidth;
        const filterResize = (e) => {
          const width = win.innerWidth;
          if (width === lastWidth) e.stopImmediatePropagation();
          lastWidth = width;
        };
        win.addEventListener('resize', filterResize, true);
        cleanups.push(() => win.removeEventListener('resize', filterResize, true));
      }
      requestAnimationFrame(resize);
    };

    frame.addEventListener('load', onLoad);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', onScroll, { passive: true });
    // The iframe may already have loaded before the effect ran.
    const doc = frame.contentDocument;
    if (doc?.readyState === 'complete' && doc.URL !== 'about:blank') onLoad();

    return () => {
      frame.removeEventListener('load', onLoad);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
      observer?.disconnect();
      cleanups.forEach((fn) => fn());
    };
  }, [src, active]);

  return (
    <section ref={sectionRef} className="th-section" data-section={id} aria-label={label} style={{ background }}>
      <iframe
        ref={frameRef}
        className="th-frame"
        title={title}
        src={active ? src : undefined}
        style={{ height: `${placeholderHeight}px` }}
        loading="eager"
        scrolling="no"
      />
    </section>
  );
}
