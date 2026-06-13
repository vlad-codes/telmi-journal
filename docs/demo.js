/* Telmi landing — self-animating chat demo.
   Fakes a calm Telmi conversation, then slides in a "remembered" note.
   No AI, no network — pure scripted timing. */

(function () {
  "use strict";

  const chat = document.getElementById("demo-chat");
  const memoryCard = document.getElementById("memory-card");
  const memoryNote = document.getElementById("memory-note");
  if (!chat) return;

  // A few scripted scenes that rotate. `remember` triggers the memory card.
  const scenes = [
    [
      { from: "user",  text: "Honestly today was rough. Big deadline at work all week." },
      { from: "telmi", text: "Sounds draining. Is the deadline still hanging over you, or did it get pushed?" },
      { from: "user",  text: "Still hanging. But I went for a run after and felt a bit better." },
      { from: "telmi", text: "Good — that run was a smart move. Want to talk through what's left, or just unwind?",
        remember: "Stressful deadline week at work. Running helps them reset." },
    ],
    [
      { from: "user",  text: "Small thing, but I finally finished the song I've been writing." },
      { from: "telmi", text: "That's not a small thing at all — you've been on that for weeks. How does it feel to be done?" },
      { from: "user",  text: "Relieved. Kind of proud, actually." },
      { from: "telmi", text: "You should be. Are you going to share it with anyone, or keep it for now?",
        remember: "Writes music. Finished a song they'd worked on for weeks — proud of it." },
    ],
    [
      { from: "user",  text: "Trip to Lisbon is booked! Leaving in two weeks." },
      { from: "telmi", text: "Lisbon, finally! You've been talking about that one. Going with anyone?" },
      { from: "user",  text: "Just me this time. Want to slow down and not plan every hour." },
      { from: "telmi", text: "A slow solo trip sounds exactly right after this stretch. I'll check in when it gets close.",
        remember: "Solo trip to Lisbon in ~2 weeks. Wants a slow, unplanned pace." },
    ],
  ];

  let sceneIndex = 0;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const TYPING_MS   = 1100;   // "Telmi is typing" dots
  const READ_USER   = 1400;   // pause after a user line
  const READ_TELMI  = 2200;   // pause after a Telmi line
  const LOOP_PAUSE  = 4200;   // pause before restarting

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function addBubble(from, text) {
    const el = document.createElement("div");
    el.className = "bubble bubble--" + from;
    el.textContent = text;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  function showTyping() {
    const el = document.createElement("div");
    el.className = "bubble bubble--telmi bubble--typing";
    el.innerHTML = "<span></span><span></span><span></span>";
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  function showMemory(note) {
    if (!memoryCard) return;
    memoryNote.textContent = note;
    memoryCard.classList.add("is-visible");
  }

  function reset() {
    chat.innerHTML = "";
    if (memoryCard) memoryCard.classList.remove("is-visible");
  }

  async function play() {
    reset();
    const script = scenes[sceneIndex];
    for (const line of script) {
      if (line.from === "telmi") {
        const dots = showTyping();
        await wait(TYPING_MS);
        dots.remove();
        addBubble("telmi", line.text);
        if (line.remember) {
          await wait(700);
          showMemory(line.remember);
        }
        await wait(READ_TELMI);
      } else {
        addBubble("user", line.text);
        await wait(READ_USER);
      }
    }
    await wait(LOOP_PAUSE);
    sceneIndex = (sceneIndex + 1) % scenes.length;
    play();
  }

  // Render the full conversation statically when motion is reduced.
  function renderStatic() {
    reset();
    for (const line of scenes[0]) {
      const el = addBubble(line.from, line.text);
      el.style.animation = "none";
      el.style.opacity = "1";
      if (line.remember) showMemory(line.remember);
    }
  }

  if (reduce) {
    renderStatic();
    return;
  }

  // Only start once the demo scrolls into view.
  let started = false;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !started) {
          started = true;
          play();
          io.disconnect();
        }
      });
    },
    { threshold: 0.4 }
  );
  io.observe(chat);
})();
