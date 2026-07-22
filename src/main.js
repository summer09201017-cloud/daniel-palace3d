import "./styles.css";
// daniel-palace3d main.js —— UI 接線+潛行/禱告 HUD+播報(字幕+mp3 人聲)+經文朗讀(曉臻)
// 玩法:WASD 潛行避獵手火把光錐→到同伴處→指針進綠區按 J 祈求/K 指明/L 稱頌。
import { DanielGame, DIFFICULTY_PRESETS } from "./game.js";
import { AudioManager } from "./audio.js";
import { loadSettings, saveSettings } from "./storage.js";
import { speakLine, setVoiceEnabled } from "./voice.js";
import { SCRIPTURES } from "./voicePhrases.js";

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $("gameCanvas"),
  scoreSheet: $("scoreSheet"),
  powerPanel: $("powerPanel"), powerFill: $("powerFill"), powerLabel: $("powerLabel"),
  statusMessage: $("statusMessage"), commentaryBar: $("commentaryBar"), strikeFlash: $("strikeFlash"),
  touchRoll: $("touchRoll"), touchLeft: $("touchLeft"), touchRight: $("touchRight"),
  menuButton: $("menuButton"), audioButton: $("audioButton"), cameraButton: $("cameraButton"),
  matchOverlay: $("matchOverlay"), overlayTitle: $("overlayTitle"), overlayText: $("overlayText"),
  overlayMenuButton: $("overlayMenuButton"), overlayReplayButton: $("overlayReplayButton"),
  homeScreen: $("homeScreen"),
  framesSelect: $("framesSelect"), difficultySelect: $("difficultySelect"), audioSelect: $("audioSelect"),
  startMatchButton: $("startMatchButton"),
};

const settings = loadSettings();
let selectedDifficulty = DIFFICULTY_PRESETS[settings.difficulty] ? settings.difficulty : "easy";
let selectedLegs = [1, 2, 3].includes(settings.frames) ? settings.frames : 2;
let audioEnabled = settings.audioEnabled !== false;

const audio = new AudioManager();
audio.setEnabled(audioEnabled);
setVoiceEnabled(audioEnabled);

const game = new DanielGame({ canvas: ui.canvas });
window.__daniel3d = game; // dev hook

function pushCommentary(sub, tone = "info", say = "") {
  const bar = ui.commentaryBar;
  if (!bar || !sub) return;
  bar.hidden = false;
  bar.dataset.tone = tone;
  bar.textContent = sub;
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
  if (say) speakLine(say);
}
function flash(text, ms = 1200) {
  ui.strikeFlash.hidden = false;
  ui.strikeFlash.textContent = text;
  ui.strikeFlash.style.animation = "none";
  void ui.strikeFlash.offsetWidth;
  ui.strikeFlash.style.animation = "";
  setTimeout(() => { ui.strikeFlash.hidden = true; }, ms);
}

game.onEvent = (event) => {
  switch (event.type) {
    case "match-start":
      pushCommentary("命令發出,哲士將要見殺——但以理啊,趁夜去求那位顯明奧祕的神!(但2:13)", "info", SCRIPTURES[1]); // 開幕經文自動朗讀(曉臻)
      setTimeout(() => speakLine("殺令之夜,潛行開始!"), 9000);
      break;
    case "caught":
      audio.buzz();
      flash("被發現了!", 1000);
      pushCommentary("火把照到你了……退回藏身點,貼著帷幔柱影走!", "cool", "被發現了,退回藏身點!");
      break;
    case "boss":
      audio.buzz();
      flash("護衛長來了!", 1400);
      pushCommentary("護衛長突然出現,直朝你追來——快跑、躲進帷幔柱影!", "cool", "護衛長來了,快躲起來!");
      break;
    case "leg":
      audio.uiTap();
      pushCommentary(`好位置!前進到第 ${event.n} 個紅圈。`, "hot", "好位置,繼續前進!");
      break;
    case "signal-start":
      audio.cheer();
      flash("就位!", 900);
      pushCommentary("到了同伴那裡!同心禱告——指針進綠區,照順序按!", "hot", "到了,與同伴同心禱告!");
      break;
    case "signal-hit":
      audio.kick(0.8);
      flash(event.label + "!", 900);
      pushCommentary(`${event.label}!四人同心,神必垂聽!`, "hot", event.phrase);
      break;
    case "signal-miss":
      audio.uiTap();
      pushCommentary("還沒到時候……等指針進綠區再按!", "cool", "還沒到時候,再等指針進綠區。");
      break;
    case "signal-wrong":
      pushCommentary(`現在要按的是「${event.expect}」!`, "cool", "");
      break;
    case "rout":
      audio.horn(); audio.crowdCheer(1);
      flash("奧祕顯明!", 1800);
      pushCommentary("這奧祕的事就在夜間異象中給但以理顯明!(但2:19)天亮了——哲士都得救了!", "hot", "奧祕顯明,天亮了!");
      setTimeout(() => speakLine("哲士得救了!"), 2400);
      break;
    case "status":
      pushCommentary(event.text, "info", "");
      break;
    case "match-end":
      try { if (!['localhost','127.0.0.1'].includes(location.hostname)) {   // -done:玩完一局(t=本局秒數,/stats 使用次數與平均停留吃這個)
        var __dt = Math.round((Date.now() - (window.__matchT0 || Date.now())) / 1000);
        navigator.sendBeacon?.('https://hfpc-play-stats.summer09201017.workers.dev/api/ping?g=daniel-palace3d-done&t=' + __dt);
      } } catch (_) {}
      window.psPing?.("daniel-palace3d-done", window.__psT0 ? Math.round((Date.now() - window.__psT0) / 1000) : 0);
      audio.cheer(); audio.crowdCheer(1);
      ui.matchOverlay.classList.add("visible");
      ui.overlayTitle.textContent = event.title;
      ui.overlayText.textContent = event.text;
      if (event.caught === 0) speakLine("完美潛行,無人發現。");
      setTimeout(() => speakLine(SCRIPTURES[0]), 2600); // 終幕經文自動朗讀(曉臻)
      break;
    default:
      break;
  }
};

// HUD:潛行=段數/被發現;信號=指針大條+綠區
game.onHud = (s) => {
  ui.statusMessage.textContent = s.message;
  if (s.phase === "signal") {
    ui.powerPanel.hidden = false;
    ui.powerLabel.textContent = `禱告:${s.signalLabel}`;
    ui.powerFill.style.transform = `scaleX(${s.meterValue})`;
    const inWin = s.meterValue >= s.windowStart && s.meterValue <= s.windowEnd;
    ui.powerFill.classList.toggle("full", inWin);
  } else {
    ui.powerPanel.hidden = true;
  }
  if (ui.touchRoll) {
    ui.touchRoll.hidden = s.phase !== "signal";
    ui.touchRoll.textContent = s.phase === "signal" ? `🙏 ${s.signalLabel}(J/K/L 或點我)` : "—";
    ui.touchRoll.disabled = s.phase !== "signal";
  }
  const sneak = s.phase === "sneak";
  if (ui.touchLeft) ui.touchLeft.hidden = !sneak;
  if (ui.touchRight) ui.touchRight.hidden = !sneak;
  if (s.phase === "menu") { ui.scoreSheet.hidden = true; return; }
  ui.scoreSheet.hidden = false;
  ui.scoreSheet.innerHTML = `<table><tr><td class="pname">路段</td><td class="total">${s.legIdx}/${s.totalLegs}</td></tr><tr><td class="pname">被發現</td><td class="total">${s.caught} 次</td></tr></table><div class="stones-left">禱告 ${s.signalIdx}/3・避開獵手火把</div>`;
};

// ── 鍵盤:WASD/方向鍵 移動;J/K/L 信號;V 視角 ──
const held = { x: 0, z: 0 };
function syncMove() { game.move.x = held.x; game.move.z = held.z; }
window.addEventListener("keydown", (e) => {
  if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
  if (game.phase === "menu" || game.phase === "done") return;
  audio.unlock();
  if (e.code === "KeyA" || e.code === "ArrowLeft") held.x = -1;
  if (e.code === "KeyD" || e.code === "ArrowRight") held.x = 1;
  if (e.code === "KeyW" || e.code === "ArrowUp") held.z = -1;
  if (e.code === "KeyS" || e.code === "ArrowDown") held.z = 1;
  syncMove();
  if (!e.repeat) {
    if (e.code === "Space") game.pressSignal(["horn", "jar", "torch"][game.signalIdx] || "horn"); // 空白鍵=當前該按的信號(手機/簡化)
    if (e.code === "KeyJ") game.pressSignal("horn");
    if (e.code === "KeyK") game.pressSignal("jar");
    if (e.code === "KeyL") game.pressSignal("torch");
    if (e.code === "KeyV") game.cycleCamView();
  }
});
window.addEventListener("keyup", (e) => {
  if (["KeyA", "ArrowLeft"].includes(e.code) && held.x === -1) held.x = 0;
  if (["KeyD", "ArrowRight"].includes(e.code) && held.x === 1) held.x = 0;
  if (["KeyW", "ArrowUp"].includes(e.code) && held.z === -1) held.z = 0;
  if (["KeyS", "ArrowDown"].includes(e.code) && held.z === 1) held.z = 0;
  syncMove();
});

// 拖曳=朝手指方向移動(手機單指流)
let press = null;
ui.canvas.addEventListener("pointerdown", (e) => {
  if (game.phase === "menu" || game.phase === "done") return;
  audio.unlock();
  press = { x: e.clientX, y: e.clientY };
});
window.addEventListener("pointermove", (e) => {
  if (!press || game.phase !== "sneak") return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  const m = Math.hypot(dx, dy);
  if (m > 14) { game.move.x = dx / m; game.move.z = dy / m; }
});
for (const ev of ["pointerup", "pointercancel"]) {
  window.addEventListener(ev, () => { press = null; game.move.x = held.x; game.move.z = held.z; });
}
window.addEventListener("contextmenu", (e) => { if (e.target.closest(".touch-action") || e.target.id === "gameCanvas") e.preventDefault(); });

// 觸控鈕:信號鈕(當前信號)+左右微調
ui.touchRoll.addEventListener("pointerdown", (e) => {
  e.preventDefault(); audio.unlock();
  const key = ["horn", "jar", "torch"][game.signalIdx] || "horn";
  game.pressSignal(key);
});
let holdL = null, holdR = null;
ui.touchLeft.addEventListener("pointerdown", (e) => { e.preventDefault(); audio.unlock(); holdL = setInterval(() => { game.move.x = -1; }, 40); });
ui.touchRight.addEventListener("pointerdown", (e) => { e.preventDefault(); audio.unlock(); holdR = setInterval(() => { game.move.x = 1; }, 40); });
for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
  ui.touchLeft.addEventListener(ev, () => { clearInterval(holdL); game.move.x = held.x; });
  ui.touchRight.addEventListener(ev, () => { clearInterval(holdR); game.move.x = held.x; });
}

// HUD 鈕
ui.cameraButton.addEventListener("click", () => { audio.uiTap(); game.cycleCamView(); });
ui.menuButton.addEventListener("click", () => {
  audio.uiTap();
  game.phase = "menu";
  ui.homeScreen.classList.add("visible");
  ui.matchOverlay.classList.remove("visible");
  ui.scoreSheet.hidden = true;
  ui.powerPanel.hidden = true;
});
const setAudio = (on) => {
  audioEnabled = on;
  audio.setEnabled(on);
  setVoiceEnabled(on);
  ui.audioButton.textContent = on ? "音效開啟" : "音效靜音";
  persist();
};
ui.audioButton.addEventListener("click", () => setAudio(!audioEnabled));
ui.audioSelect.addEventListener("change", (e) => setAudio(e.target.value === "on"));

function persist() {
  saveSettings({ modeId: "solo", difficulty: selectedDifficulty, frames: selectedLegs, audioEnabled });
}
function syncMenu() {
  ui.difficultySelect.value = selectedDifficulty;
  ui.framesSelect.value = String(selectedLegs);
  ui.audioSelect.value = audioEnabled ? "on" : "off";
}
ui.difficultySelect.addEventListener("change", (e) => { selectedDifficulty = e.target.value; persist(); });
ui.framesSelect.addEventListener("change", (e) => { selectedLegs = Number(e.target.value); persist(); });

ui.startMatchButton.addEventListener("click", () => {
  window.__matchT0 = Date.now();   // -done beacon 用:本局開始時間
  audio.unlock(); audio.uiTap();
  window.psPing?.("daniel-palace3d-start"); window.__psT0 = Date.now();
  persist();
  game.applyPresentation({ difficulty: selectedDifficulty, frames: selectedLegs });
  ui.homeScreen.classList.remove("visible");
  ui.matchOverlay.classList.remove("visible");
  game.startMatch();
});
ui.overlayReplayButton.addEventListener("click", () => {
  audio.uiTap();
  ui.matchOverlay.classList.remove("visible");
  game.startMatch();
});
ui.overlayMenuButton.addEventListener("click", () => {
  audio.uiTap();
  ui.matchOverlay.classList.remove("visible");
  game.phase = "menu";
  ui.homeScreen.classList.add("visible");
  ui.scoreSheet.hidden = true;
});

const doResize = () => game.resize();
window.addEventListener("resize", doResize);
syncMenu();
doResize();
game.startLoop();
