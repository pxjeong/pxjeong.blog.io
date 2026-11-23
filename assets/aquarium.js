const storageKey = "pxjeong-aquarium-v1";
const maxGrowthFeeds = 42;
const feedCooldown = 1250;
const tailFrames = [-2, -1, 0, 1, 2];
const fishCode = [
  { name: "C", code: "*p", tail: "⋈", fin: "#" },
  { name: "Java", code: "new", tail: "⋈", fin: "@" },
  { name: "JavaScript", code: "let", tail: "≪", fin: ";" },
  { name: "Python", code: "def", tail: "⋈", fin: ":" },
  { name: "Rust", code: "fn", tail: "❮", fin: "&" },
  { name: "Go", code: "go", tail: "≪", fin: ":" },
  { name: "Ruby", code: "nil", tail: "⋈", fin: "@" },
  { name: "Kotlin", code: "val", tail: "❮", fin: "?" },
  { name: "Swift", code: "var", tail: "≪", fin: "!" },
  { name: "C++", code: "::", tail: "⋈", fin: "&" },
];
const spriteWidth = 48;
const spriteHeight = 26;
const spriteResolution = 3;
const mouthOffset = 17;
const maxPellets = 24;
const previewSwimmers = [
  [.23, .41], [.42, .60], [.62, .35], [.72, .57],
  [.83, .42], [.27, .72], [.56, .77], [.79, .74], [.38, .28],
];

function readTank() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Number.isSafeInteger(saved?.feeds) && saved.feeds >= 0) {
      return { feeds: saved.feeds, births: Object.assign(Object.create(null), saved.births) };
    }
  } catch {
    // The tank still works when the browser blocks storage.
  }
  return { feeds: 0, births: Object.create(null) };
}

function randomFor(value) {
  let seed = 2166136261;
  for (const letter of value) seed = Math.imul(seed ^ letter.codePointAt(0), 16777619);
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeFishSprite(color, language, tailOffset, direction) {
  const sprite = document.createElement("canvas");
  sprite.width = spriteWidth * spriteResolution;
  sprite.height = spriteHeight * spriteResolution;
  const ctx = sprite.getContext("2d");
  ctx.translate(sprite.width / 2, sprite.height / 2);
  ctx.scale(spriteResolution, spriteResolution);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;

  function glyph(text, size, x, y) {
    ctx.font = `600 ${size}px "DejaVu Sans Mono", Menlo, Consolas, monospace`;
    ctx.fillText(text, x, y);
  }

  ctx.globalAlpha = .92;
  ctx.save();
  ctx.scale(direction, 1);
  glyph(language.tail, 14 - Math.abs(tailOffset), -17, tailOffset);
  glyph("⟨", 17, -9, 0);
  glyph("›", 16, mouthOffset, 0);
  ctx.restore();
  ctx.globalAlpha = .74;
  glyph(language.fin, 7, -2 * direction, -6);
  glyph("~", 8, -2 * direction, 6);
  ctx.globalAlpha = 1;
  glyph(language.code, 9, 0, 0);
  ctx.fillStyle = "#fafafa";
  glyph("•", 7, 11 * direction, -1);
  return sprite;
}

function drawFish(ctx, fish, elapsed, still) {
  const { x, y, direction, phase, size, sprites } = fish;
  const frame = still ? 2 : Math.round(2 + Math.sin(elapsed * (fish.burst > 0 ? 17 : 7) + phase) * 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.drawImage(sprites[direction][frame], -spriteWidth / 2, -spriteHeight / 2, spriteWidth, spriteHeight);
  ctx.restore();
}

export function startAquarium(posts, categories) {
  const canvas = document.querySelector("#fish-canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const feedButton = document.querySelector("#feed-button");
  const fishCount = document.querySelector("#fish-count");
  const feedback = document.querySelector("#tank-feedback");
  const tank = readTank();
  const food = [];
  const now = performance.now();
  let lastFeed = -Infinity;
  let lastFrame = now;
  let clearFeedback;
  let animationFrame;
  let width = 0;
  let height = 0;
  const spriteCache = new Map();
  let drag = null;

  const isPreview = !posts.length;
  const swimmers = isPreview
    ? previewSwimmers.map((_, index) => ({ id: `preview-${index}`, category: categories[index % categories.length].id }))
    : posts;

  if (isPreview) {
    document.querySelector("#tank-mode").textContent = "미리보기";
    document.querySelector("#tank-status").hidden = false;
  }
  fishCount.textContent = swimmers.length;
  const fish = swimmers.map((post, index) => {
    const random = randomFor(post.id);
    const { color } = categories.find((category) => category.id === post.category);
    const language = fishCode[Math.floor(random() * fishCode.length)];
    const key = `${color}:${language.name}`;
    if (!spriteCache.has(key)) {
      const frames = (direction) => tailFrames.map((offset) => makeFishSprite(color, language, offset, direction));
      spriteCache.set(key, { [-1]: frames(-1), 1: frames(1) });
    }
    const [xRatio, yRatio] = isPreview ? previewSwimmers[index] : [.12 + random() * .76, .22 + random() * .59];
    if (!Number.isSafeInteger(tank.births[post.id])) tank.births[post.id] = tank.feeds;
    return {
      xRatio, yRatio, x: 0, y: 0, sprites: spriteCache.get(key), language: language.name, title: post.title,
      direction: random() < .5 ? -1 : 1, phase: random() * Math.PI * 2,
      speed: 12 + random() * 17, baseSize: .73 + random() * .23,
      birth: tank.births[post.id], burst: 0, rise: 0, size: 1,
    };
  });

  function notify(message) {
    clearTimeout(clearFeedback);
    feedback.textContent = message;
    clearFeedback = setTimeout(() => { feedback.textContent = ""; }, 2200);
  }

  function feed(announce = false) {
    const time = performance.now();
    if (time - lastFeed < feedCooldown) return;
    lastFeed = time;
    feedButton.disabled = true;
    setTimeout(() => { feedButton.disabled = false; }, feedCooldown);
    tank.feeds += 1;
    try {
      localStorage.setItem(storageKey, JSON.stringify(tank));
    } catch {
      // Growth for this visit still works.
    }
    const center = width * (.39 + Math.random() * .22);
    const spacing = Math.min(width * .115, 37);
    for (let index = 0; index < 5; index += 1) {
      if (food.length >= maxPellets) food.splice(food.findIndex((pellet) => pellet !== drag?.pellet), 1);
      food.push({
        x: center + (index - 2) * spacing,
        y: height * (.15 + (index % 2) * .045),
        speed: 14 + Math.random() * 14,
        radius: 2.5 + Math.random(),
      });
    }
    if (announce) notify("먹이가 떨어졌어요!");
    requestDraw();
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    if (box.width < 1 || box.height < 1 || (box.width === width && box.height === height)) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    for (const swimmer of fish) {
      swimmer.x = width ? swimmer.x * box.width / width : swimmer.xRatio * box.width;
      swimmer.y = height ? swimmer.y * box.height / height : swimmer.yRatio * box.height;
    }
    for (const pellet of food) {
      pellet.x *= box.width / width;
      pellet.y *= box.height / height;
    }
    width = box.width;
    height = box.height;
    requestDraw();
  }

  function advanceFish(swimmer, dt, elapsed) {
    const drift = Math.sin(elapsed * .76 + swimmer.phase) * 9;
    const bait = drag?.pellet;
    if (bait && swimmer.burst === 0 && Math.abs(bait.x - swimmer.x) < 78 && Math.abs(bait.y - swimmer.y) < 58) {
      swimmer.direction = Math.abs(bait.x - swimmer.x) > 8 ? Math.sign(bait.x - swimmer.x) : swimmer.direction;
      swimmer.y += Math.sign(bait.y - swimmer.y) * dt * 11;
    }
    swimmer.x += swimmer.direction * (swimmer.speed + swimmer.burst * 175) * dt;
    swimmer.y += (drift + swimmer.rise * swimmer.burst * 46) * dt;
    swimmer.y = Math.max(height * .20, Math.min(height * .88, swimmer.y));
    swimmer.burst = Math.max(0, swimmer.burst - dt * 1.55);
    if (swimmer.x < 23 || swimmer.x > width - 23) {
      swimmer.direction = swimmer.x < 23 ? 1 : -1;
      swimmer.x = Math.max(23, Math.min(width - 23, swimmer.x));
    }
  }

  function mouthDistance(swimmer, pellet) {
    const mouthX = swimmer.x + swimmer.direction * swimmer.size * mouthOffset;
    return Math.hypot(pellet.x - mouthX, pellet.y - swimmer.y);
  }

  function stopDrag() {
    if (!drag) return;
    const { pointerId } = drag;
    drag = null;
    canvas.classList.remove("is-dragging-food", "is-over-food");
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    requestDraw();
  }

  function eat(pellet, swimmer) {
    food.splice(food.indexOf(pellet), 1);
    if (drag?.pellet === pellet) stopDrag();
    notify(`${swimmer.language} 물고기가 먹이를 먹었어요!`);
    requestDraw();
  }

  function checkBite() {
    if (!drag) return;
    const { pellet, biteRadius } = drag;
    const swimmer = fish.find((candidate) => mouthDistance(candidate, pellet) <= biteRadius);
    if (swimmer) eat(pellet, swimmer);
  }

  function render(time) {
    animationFrame = undefined;
    const dt = Math.min((time - lastFrame) / 1000, .045);
    const elapsed = (time - now) / 1000;
    const still = motion.matches;
    lastFrame = time;
    ctx.clearRect(0, 0, width, height);

    for (const swimmer of fish) {
      if (!still) advanceFish(swimmer, dt, elapsed);
      const age = Math.min(maxGrowthFeeds, Math.max(0, tank.feeds - swimmer.birth));
      swimmer.size = swimmer.baseSize * (1 + age * .006);
      drawFish(ctx, swimmer, elapsed, still);
    }
    checkBite();
    for (const pellet of food) {
      const held = pellet === drag?.pellet;
      if (!still && !held) pellet.y = Math.min(height - 12, pellet.y + pellet.speed * dt);
      ctx.fillStyle = held ? "#ffffff" : "#a8a8a8";
      ctx.beginPath();
      ctx.arc(pellet.x, pellet.y, pellet.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!still) requestDraw();
  }

  function requestDraw() {
    if (animationFrame === undefined) animationFrame = requestAnimationFrame(render);
  }

  function pointerPosition(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function nearest(items, point, radius) {
    let nearestItem = null;
    for (const item of items) {
      const distance = Math.hypot(point.x - item.x, point.y - item.y);
      if (distance < radius) {
        nearestItem = item;
        radius = distance;
      }
    }
    return nearestItem;
  }

  function moveFood(event) {
    const { x, y } = pointerPosition(event);
    drag.pellet.x = Math.max(4, Math.min(width - 4, x));
    drag.pellet.y = Math.max(4, Math.min(height - 4, y));
    checkBite();
    requestDraw();
  }

  canvas.addEventListener("pointermove", (event) => {
    if (drag) {
      if (drag.pointerId === event.pointerId) moveFood(event);
      return;
    }
    const point = pointerPosition(event);
    const overFood = Boolean(nearest(food, point, 13));
    canvas.classList.toggle("is-over-food", overFood);
    canvas.classList.toggle("is-over-fish", !overFood && Boolean(nearest(fish, point, 24)));
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (drag || event.button !== 0) return;
    const point = pointerPosition(event);
    const touch = event.pointerType === "touch";
    const pellet = nearest(food, point, touch ? 22 : 13);
    if (pellet) {
      drag = { pellet, pointerId: event.pointerId, biteRadius: touch ? 10 : 8 };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-dragging-food");
      requestDraw();
      return;
    }

    const swimmer = nearest(fish, point, touch ? 28 : 24);
    if (!swimmer) return;
    swimmer.direction = swimmer.x < point.x ? -1 : 1;
    swimmer.rise = swimmer.y < point.y ? -1 : 1;
    swimmer.burst = 1;
    if (motion.matches) swimmer.x = Math.max(23, Math.min(width - 23, swimmer.x + swimmer.direction * 12));
    requestDraw();
    notify(swimmer.title ? `${swimmer.language} 물고기 · ${swimmer.title}` : `${swimmer.language} 물고기가 헤엄쳤어요!`);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(eventName, (event) => {
      if (drag?.pointerId === event.pointerId) stopDrag();
    });
  }
  canvas.addEventListener("pointerleave", () => canvas.classList.remove("is-over-food", "is-over-fish"));
  canvas.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key.toLowerCase() === "f" && food.length && !drag) {
      const pellet = food[0];
      const swimmer = fish.reduce((closest, candidate) =>
        mouthDistance(candidate, pellet) < mouthDistance(closest, pellet) ? candidate : closest
      );
      eat(pellet, swimmer);
      return;
    }
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    for (const swimmer of fish) {
      swimmer.burst = 1;
      swimmer.rise = Math.sin(swimmer.phase);
      if (motion.matches) swimmer.x = Math.max(23, Math.min(width - 23, swimmer.x + swimmer.direction * 12));
    }
    requestDraw();
    notify("물고기가 흩어졌어요.");
  });

  resize();
  new ResizeObserver(resize).observe(canvas);
  motion.addEventListener("change", requestDraw);
  feed();
  feedButton.addEventListener("click", () => feed(true));
}
