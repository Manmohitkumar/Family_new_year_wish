// Click-driven scene navigation (no vertical scroll)
gsap.registerPlugin(ScrollTrigger);

const scenes = Array.from(document.querySelectorAll('.scene'));
const canvas = document.getElementById('fireworks');
const ctx = canvas.getContext('2d');
let cw, ch, particles = [], running = false;
function resize() { cw = canvas.width = innerWidth; ch = canvas.height = innerHeight }
addEventListener('resize', resize); resize();

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.vx = (Math.random() - 0.5) * 6; this.vy = (Math.random() - 0.9) * 6;
        this.size = Math.random() * 3 + 2; this.life = 80 + Math.random() * 40; this.ttl = this.life; this.color = color;
    }
    update() { this.x += this.vx; this.y += this.vy; this.vy += 0.06; this.ttl--; }
    draw() { ctx.beginPath(); ctx.fillStyle = this.color; ctx.globalAlpha = Math.max(0, this.ttl / this.life); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); }
}

// On load: relocate existing #memories into overlay layer (so it sits above canvas)
document.addEventListener('DOMContentLoaded', () => {
    const layer = document.getElementById('memories-layer');
    const mem = document.getElementById('memories');
    if (layer && mem && mem.parentElement !== layer) {
        layer.appendChild(mem);
        // keep it hidden until opened
        mem.classList.remove('open');
        layer.classList.remove('open');
        layer.setAttribute('aria-hidden', 'true');
    }
});

// USER REQUEST: Disable the 'View memories' CTA and remove the audio consent popup
// This keeps the background and memories functionality intact but removes the on-screen prompts.
window.showMemoriesCTA = function () { /* disabled by user preference */ };
document.addEventListener('DOMContentLoaded', () => {
    const cta = document.getElementById('view-memories'); if (cta) cta.remove();
    const audioPrompt = document.getElementById('audio-prompt'); if (audioPrompt) audioPrompt.remove();
    // Hide any leftover CTA styles if created dynamically
    const styleEl = document.getElementById('view-memories-style'); if (styleEl) styleEl.remove();
});

function spawnBurst(x, y, hueBase = 200) {
    const count = 40 + Math.floor(Math.random() * 40);
    for (let i = 0; i < count; i++) {
        const hue = hueBase + Math.random() * 60 - 30;
        const color = `hsl(${hue}deg ${80}% ${60}%)`;
        particles.push(new Particle(x, y, color));
    }
    running = true; animate();
}

function animate() {
    if (!running) return; ctx.clearRect(0, 0, cw, ch);
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.update(); p.draw();
        if (p.ttl <= 0) { particles.splice(i, 1) }
    }
    if (particles.length > 0) requestAnimationFrame(animate); else running = false;
}

// Click-through navigation
let current = 0;
function animateIn(idx) {
    const scene = scenes[idx];
    const card = scene.querySelector('.card');
    // prefer per-scene timeline if available
    scene.classList.add('active');
    if (scene._tl && typeof scene._tl.play === 'function') {
        // ensure timeline starts from beginning
        scene._tl.play(0);
    } else {
        gsap.fromTo(card, { y: 30, opacity: 0, scale: 0.995 }, { y: 0, opacity: 1, scale: 1, duration: 1.1, ease: 'power2.out' });
    }
}

function animateOut(idx) {
    return new Promise(resolve => {
        const scene = scenes[idx];
        const card = scene.querySelector('.card');
        // if scene has a timeline that has progressed, reverse it for a smooth out
        if (scene._tl && scene._tl.progress() > 0) {
            scene._tl.timeScale(1.6);
            scene._tl.reverse();
            scene._tl.eventCallback('onReverseComplete', () => { scene.classList.remove('active'); resolve(); });
        } else {
            gsap.to(card, { y: -20, opacity: 0, duration: 0.6, ease: 'power1.in', onComplete: () => { scene.classList.remove('active'); resolve(); } });
        }
    });
}

async function showScene(idx) {
    if (idx < 0 || idx >= scenes.length) return;
    if (idx === current) return;
    await animateOut(current);
    current = idx;
    animateIn(current);
}

// initialize first scene
document.addEventListener('DOMContentLoaded', () => {
    // make sure all scenes stacked but hidden, then show first
    scenes.forEach((s, i) => { s.classList.remove('active'); });
    // build per-scene timelines then show first
    if (typeof createSceneTimelines === 'function') createSceneTimelines();
    animateIn(0);
});

// attach click handlers on cards to advance
scenes.forEach((s, i) => {
    const card = s.querySelector('.card');
    if (!card) return;
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
        // start audio on first user interaction (if available)
        startAudioIfNeeded();
        const next = Math.min(scenes.length - 1, i + 1);
        showScene(next);
    });
});

// reveal button moves to final
const btn = document.querySelector('.reveal-btn');
if (btn) btn.addEventListener('click', (e) => { e.currentTarget.blur(); const finalIndex = scenes.findIndex(s => s.classList.contains('final-reveal')); if (finalIndex >= 0) showScene(finalIndex); });

// keyboard navigation
window.addEventListener('keydown', (e) => {
    const keysNext = ['ArrowDown', 'PageDown', ' '];
    const keysPrev = ['ArrowUp', 'PageUp'];
    if (keysNext.includes(e.key)) { e.preventDefault(); showScene(Math.min(scenes.length - 1, current + 1)); }
    else if (keysPrev.includes(e.key)) { e.preventDefault(); showScene(Math.max(0, current - 1)); }
});

// Cursor follow with lerp for 3D-like movement (keeps original behavior)
const cursor = document.getElementById('cursor');
const innerDot = cursor ? cursor.querySelector('.inner') : null;
let mouse = { x: innerWidth / 2, y: innerHeight / 2 }, pos = { x: innerWidth / 2, y: innerHeight / 2 };
window.addEventListener('touchstart', () => { }, { passive: true });
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
function lerp(a, b, n) { return (1 - n) * a + n * b }
function cursorLoop() {
    if (!cursor) return;
    pos.x = lerp(pos.x, mouse.x, 0.18); pos.y = lerp(pos.y, mouse.y, 0.18);
    const dx = mouse.x - pos.x; const dy = mouse.y - pos.y; const rot = Math.atan2(dy, dx) * 8;
    cursor.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%,-50%) rotate(${rot}deg)`;
    const dist = Math.min(1.2, Math.hypot(dx, dy) / 120);
    if (innerDot) innerDot.style.transform = `scale(${1 + dist * 0.18})`;
    requestAnimationFrame(cursorLoop);
}
if (cursor) cursorLoop();

// respect reduced motion
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.globalTimeline.timeScale(0);

// Audio handling (user-initiated)
const audio = document.getElementById('song');
const audioToggle = document.getElementById('audio-toggle');
let audioStarted = false;

function startAudioIfNeeded() {
    if (!audio || audioStarted) return;
    audio.play().then(() => {
        audioStarted = true;
        if (audioToggle) { audioToggle.setAttribute('aria-pressed', 'true'); audioToggle.textContent = '❚❚'; }
    }).catch(() => {
        // play failed (e.g., blocked) - keep silent until user toggles
    });
}

function toggleAudio() {
    if (!audio) return;
    if (audio.paused) {
        audio.play().then(() => { if (audioToggle) { audioToggle.setAttribute('aria-pressed', 'true'); audioToggle.textContent = '❚❚'; } }).catch(() => { });
    } else {
        audio.pause(); if (audioToggle) { audioToggle.setAttribute('aria-pressed', 'false'); audioToggle.textContent = '▶'; }
    }
}

if (audioToggle) {
    // hide toggle if no audio src
    if (!audio || !audio.src) audioToggle.style.display = 'none';
    audioToggle.addEventListener('click', (e) => { e.stopPropagation(); toggleAudio(); });
}

// Audio prompt handling (ask user on site open)
const audioPrompt = document.getElementById('audio-prompt');
const promptYes = document.getElementById('prompt-yes');
const promptNo = document.getElementById('prompt-no');
function hideAudioPrompt() { if (!audioPrompt) return; audioPrompt.style.display = 'none'; }

if (promptYes) {
    promptYes.addEventListener('click', () => {
        hideAudioPrompt();
        // user consented -> start audio
        startAudioIfNeeded();
    });
}
if (promptNo) {
    promptNo.addEventListener('click', () => {
        hideAudioPrompt();
        // user declined: do not autoplay; audioToggle remains available
    });
}

// focus the Yes button for keyboard users
document.addEventListener('DOMContentLoaded', () => { if (promptYes) promptYes.focus(); });

/* Memories: lazy-load and GSAP animations (internal scroller) */
function setupMemories(scrollerEl) {
    const mems = Array.from(document.querySelectorAll('.memory'));
    // lazy load images when near viewport of scroller
    const io = new IntersectionObserver((entries) => {
        entries.forEach(en => {
            if (en.isIntersecting) {
                const el = en.target;
                if (!el.dataset.loaded) {
                    const src = el.dataset.src;
                    if (src) el.style.backgroundImage = `url('${src}')`;
                    el.dataset.loaded = 'true';
                }
            }
        });
    }, { root: scrollerEl, rootMargin: '300px' });

    mems.forEach(m => {
        io.observe(m);
        const n = m.dataset.memory;
        // choose animation per memory
        switch (n) {
            case '1': // fade-in + slight zoom
                gsap.fromTo(m, { opacity: 0, scale: 1 }, { opacity: 1, scale: 1.08, duration: 1.8, ease: 'power2.out', scrollTrigger: { trigger: m, scroller: scrollerEl, start: 'top center', toggleActions: 'play reverse play reverse' } });
                break;
            case '2': // slide up + fade
                gsap.from(m, { y: 80, opacity: 0, duration: 1.4, ease: 'power2.out', scrollTrigger: { trigger: m, scroller: scrollerEl, start: 'top center', toggleActions: 'play reverse play reverse' } });
                break;
            case '3': // slide from left + blur -> clear
                m.style.filter = 'blur(6px)';
                m.style.transform = 'translateX(-40px)';
                gsap.to(m, { filter: 'blur(0px)', x: 0, duration: 1.6, ease: 'power2.out', overwrite: true, scrollTrigger: { trigger: m, scroller: scrollerEl, start: 'top center', toggleActions: 'play reverse play reverse' } });
                break;
            case '4': // slide from right + soft scale
                m.style.transform = 'translateX(60px) scale(1.01)';
                gsap.to(m, { x: 0, scale: 1, duration: 1.6, ease: 'power2.out', scrollTrigger: { trigger: m, scroller: scrollerEl, start: 'top center', toggleActions: 'play reverse play reverse' } });
                break;
            case '5': // parallax background move slower than scroll
                gsap.to(m, { backgroundPositionY: '20%', ease: 'none', scrollTrigger: { trigger: m, scroller: scrollerEl, start: 'top bottom', end: 'bottom top', scrub: 0.6 } });
                break;
            case '6': // rotate -2deg -> 0 + fade
                m.style.transform = 'rotate(-2deg)'; m.style.opacity = '0';
                gsap.to(m, { rotation: 0, opacity: 1, duration: 1.4, ease: 'power2.out', scrollTrigger: { trigger: m, scroller: scrollerEl, start: 'top center', toggleActions: 'play reverse play reverse' } });
                break;
            case '7': // Ken Burns slow zoom + pan
                gsap.fromTo(m, { scale: 1, backgroundPosition: 'center 30%' }, { scale: 1.08, backgroundPosition: 'center 50%', duration: 6, ease: 'none', scrollTrigger: { trigger: m, scroller: scrollerEl, start: 'top top', end: 'bottom top', scrub: 0.6 } });
                break;
            case '8': // fade-in with light glow pulse
                gsap.fromTo(m, { opacity: 0.85 }, { opacity: 1, duration: 1.2, ease: 'power2.out', scrollTrigger: { trigger: m, scroller: scrollerEl, start: 'top center', toggleActions: 'play reverse play reverse' }, onComplete: () => { const ov = m.querySelector('.overlay'); if (ov) gsap.to(ov, { boxShadow: '0 0 40px rgba(180,240,180,0.06)', repeat: 3, yoyo: true, duration: 1.2 }); } });
                break;
            case '9': // vertical reveal using clip-path
                m.style.clipPath = 'inset(100% 0 0 0)';
                gsap.to(m, { clipPath: 'inset(0% 0 0 0)', duration: 1.6, ease: 'power2.out', scrollTrigger: { trigger: m, scroller: scrollerEl, start: 'top center', toggleActions: 'play reverse play reverse' } });
                break;
            case '10': // horizontal reveal using clip-path
                m.style.clipPath = 'inset(0 100% 0 0)';
                gsap.to(m, { clipPath: 'inset(0 0 0 0)', duration: 1.6, ease: 'power2.out', scrollTrigger: { trigger: m, scroller: scrollerEl, start: 'top center', toggleActions: 'play reverse play reverse' } });
                break;
            case '11': // scale down from 1.15 -> 1 + fade
                m.style.transform = 'scale(1.15)'; m.style.opacity = '0';
                gsap.to(m, { scale: 1, opacity: 1, duration: 1.6, ease: 'power2.out', scrollTrigger: { trigger: m, scroller: scrollerEl, start: 'top center', toggleActions: 'play reverse play reverse' } });
                break;
            case '12': // slow fade-in, hold longer
                gsap.fromTo(m, { opacity: 0 }, { opacity: 1, duration: 3.2, ease: 'power2.out', scrollTrigger: { trigger: m, scroller: scrollerEl, start: 'top center', end: 'bottom center', toggleActions: 'play reverse play reverse' } });
                break;
        }
    });
}

// Open memories container (called when user chooses to view memories)
function openMemories() {
    const mem = document.getElementById('memories');
    if (!mem) return;
    mem.classList.add('open');
    // also mark the overlay layer visible (if present)
    const layer = document.getElementById('memories-layer');
    if (layer) {
        layer.classList.add('open');
        layer.setAttribute('aria-hidden', 'false');
        // ensure the memories element is inside the overlay for proper stacking
        if (mem.parentElement !== layer) layer.appendChild(mem);
    }
    // prevent background interaction
    document.body.style.overflow = 'hidden';
    // initialize animations with mem as scroller
    setupMemories(mem);
}

// show a "View memories" CTA after the final reveal appears
function showMemoriesCTA() {
    const cta = document.createElement('button');
    cta.id = 'view-memories';
    cta.textContent = 'View memories';
    cta.style.position = 'fixed'; cta.style.zIndex = 120; cta.style.left = '50%'; cta.style.bottom = '6vh'; cta.style.transform = 'translateX(-50%)'; cta.style.padding = '12px 20px'; cta.style.borderRadius = '12px'; cta.style.border = '0'; cta.style.cursor = 'pointer'; cta.style.background = 'linear-gradient(90deg, rgba(155,230,170,0.12), rgba(100,170,120,0.06))'; cta.style.color = 'var(--accent)';
    document.body.appendChild(cta);
    cta.addEventListener('click', () => { openMemories(); cta.remove(); });
}

// Hook into final reveal: when final scene animates in, show CTA
const finalSceneEl = document.querySelector('.scene.final-reveal');
if (finalSceneEl) {
    ScrollTrigger.create({
        trigger: finalSceneEl,
        start: 'top center',
        onEnter: () => {
            // delay CTA slightly
            setTimeout(() => showMemoriesCTA(), 900);
        }
    });
}

/* Scene-specific timelines and helpers */
function createSparkles(scene, count = 14, duration = 1.2) {
    const container = scene;
    const sparks = [];
    for (let i = 0; i < count; i++) {
        const s = document.createElement('span');
        s.className = 'temp-sparkle';
        s.style.position = 'absolute';
        s.style.width = s.style.height = '8px';
        s.style.borderRadius = '50%';
        s.style.background = 'radial-gradient(circle at 30% 30%, #fff, rgba(255,255,255,0.6))';
        s.style.left = (30 + Math.random() * 40) + '%';
        s.style.top = (30 + Math.random() * 40) + '%';
        s.style.pointerEvents = 'none';
        s.style.opacity = '0';
        container.appendChild(s);
        sparks.push(s);
        const dx = (Math.random() - 0.5) * 40; const dy = -10 - Math.random() * 40;
        gsap.to(s, { opacity: 1, scale: 1 + Math.random() * 0.8, x: dx, y: dy, ease: 'power2.out', duration: duration * (0.6 + Math.random() * 0.8) });
    }
    setTimeout(() => { sparks.forEach(s => s.remove()); }, (duration + 0.6) * 1000);
}

function createSceneTimelines() {
    scenes.forEach(sc => {
        const id = sc.dataset.scene;
        const card = sc.querySelector('.card');
        const tl = gsap.timeline({ paused: true });
        // base gentle card entrance
        tl.fromTo(card, { y: 18, opacity: 0, scale: 0.995 }, { y: 0, opacity: 1, scale: 1, duration: 1.1, ease: 'power2.out' });

        switch (id) {
            case '1':
                tl.add(() => { createSparkles(sc, 6, 0.9); });
                tl.to(card, { duration: 0.8, ease: 'power1.out' });
                break;
            case '2':
                tl.from(card, { y: 40, opacity: 0, duration: 1.6, ease: 'power2.out' });
                tl.add(() => { const el = card.querySelector('.underline'); if (el) gsap.fromTo(el, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.9, transformOrigin: 'left center' }); });
                tl.add(() => { const dots = card.querySelectorAll('.dots'); if (dots) gsap.to(dots, { opacity: 0, duration: 0.9, stagger: 0.08 }); });
                break;
            case '3':
                tl.to(card.querySelectorAll('.emoji'), { scale: 1.08, duration: 0.7, yoyo: true, repeat: 1, ease: 'sine.inOut' }, '>-0.4');
                tl.add(() => { spawnBurst(innerWidth / 2, innerHeight / 2, 330); }, '>-0.6');
                break;
            case '4':
                tl.to(sc, { backgroundColor: 'rgba(0,0,0,0.18)', duration: 0.9 }, '<');
                tl.to(card, { opacity: 1, duration: 1.1 });
                break;
            case '5':
                tl.to(card, { boxShadow: '0 18px 60px rgba(220,160,60,0.12)', duration: 0.9 });
                tl.to(card.querySelectorAll('.emoji'), { scale: 1.06, duration: 0.8, yoyo: true, repeat: 1 }, '>-0.2');
                break;
            case '6': // MAIN NEW YEAR REVEAL
                tl.add(() => {
                    const cx = innerWidth / 2, cy = innerHeight / 2; spawnBurst(cx * 0.25, cy * 0.6, 330);
                    setTimeout(() => spawnBurst(cx * 0.75, cy * 0.55, 22), 220);
                    setTimeout(() => spawnBurst(cx, cy * 0.45, 340), 520);
                }, '>-0.1');
                // confetti-like slow bursts
                tl.add(() => { spawnBurst(innerWidth * 0.2, -40, 10); spawnBurst(innerWidth * 0.8, -40, 18); }, '>-0.2');
                tl.add(() => { createSparkles(sc, 22, 1.5); }, '>-0.2');
                tl.to(card, { scale: 1.02, duration: 1.4, ease: 'power2.out' }, '<');
                tl.add(() => { setTimeout(() => { /* fade everything out after short hold */ }, 1600); });
                break;
            case '7':
                // word-by-word reveal (split by spaces)
                const text = card.textContent || '';
                const words = text.trim().split(/\s+/);
                if (words.length > 1) {
                    const wrap = document.createElement('div'); wrap.className = 'word-wrap';
