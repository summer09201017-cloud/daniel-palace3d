// 3D 王宮之夜(daniel-palace3d)——但以理書 2(cuv 已查驗 2026-07-19;fork gideon300-3d 潛行底座)
// 玩法:①殺令之夜潛行——帶三同伴避開王宮獵手的火把光錐,柱影間摸到紅圈(被照到=退回藏身點,溫柔規則)
//      ②同心禱告三連——同心祈求(J)/奧祕指明(K)/稱頌真神(L),指針掃到綠區按下=四人同心
//      ③天亮顯明——奧祕在夜間異象中顯明,哲士得救,天色轉亮演出(但2:19)。
// 照 3d-game-kit:判定=畫面(光錐真實照到才算)、量值可調(路線 1/2/3 段)、V 五檔視角、字幕+人聲。
import * as THREE from "three";

export const DIFFICULTY_LABELS = { kids: "幼兒", child: "兒童", easy: "入門", normal: "標準", hard: "職業" };
// guards=巡邏兵數;fov=光錐半角(rad);range=光錐長;speed=巡邏速度;window=信號綠區寬
export const DIFFICULTY_PRESETS = {
  kids:   { guards: 1, fov: 0.30, range: 4.0, speed: 0.9, window: 0.26 },
  child:  { guards: 2, fov: 0.34, range: 5.0, speed: 1.2, window: 0.22 },
  easy:   { guards: 3, fov: 0.38, range: 5.5, speed: 1.5, window: 0.18 },
  normal: { guards: 4, fov: 0.44, range: 6.5, speed: 1.8, window: 0.13 },
  hard:   { guards: 5, fov: 0.50, range: 8.0, speed: 2.2, window: 0.10 },
};
export const GAME_MODES = { solo: { id: "solo", label: "殺令之夜" } };

const FIELD_HALF_W = 11;   // 場地半寬(x)
const START_Z = 16;        // 起點
const CAMP_Z = -14;        // 米甸營帳篷帶
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);

const SIGNALS = [
  { key: "horn", label: "同心祈求", phrase: "求天上的神施憐憫!" },
  { key: "jar", label: "奧祕指明", phrase: "將這奧祕的事指明!" },
  { key: "torch", label: "稱頌真神", phrase: "神的名是應當稱頌的!" },
];

export class DanielGame {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.onEvent = null;
    this.onHud = null;
    this.modeId = "solo";
    this.difficulty = "easy";
    this.totalLegs = 2; // 路線段數(1/2/3)
    this.phase = "menu"; // menu | sneak | signal | rout | done
    this.message = "";
    this.camView = 0;
    this.cameraShake = 0;
    try {
      const saved = Number(localStorage.getItem("daniel-palace3d-camview"));
      if ([0, 1, 2, 3, 4].includes(saved)) this.camView = saved;
    } catch { /* ignore */ }
    this.move = { x: 0, z: 0 }; // 玩家輸入向量(main.js 餵)
    // ★選單階段 render 也在跑:狀態必須先有數字,否則 undefined 進 lerp 把鏡頭毒成 NaN(07-15 踩雷)
    this.playerX = 0;
    this.playerZ = START_Z;
    this.caught = 0;
    this.legIdx = 0;
    this.signalIdx = 0;
    this.signalHits = 0;
    this.meterValue = 0;
    this.windowStart = 0.5;
    this.windowEnd = 0.7;
    this.checkpoint = { x: 0, z: START_Z };
    this._caughtT = 0;
    this._setupScene();
    this._buildField();
    this._buildActors();
    this._hudTimer = 0;
  }

  get preset() { return DIFFICULTY_PRESETS[this.difficulty]; }
  emit(type, payload = {}) { if (this.onEvent) this.onEvent({ type, ...payload }); }

  _setupScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b101e); // 三更之初的夜
    this.scene.fog = new THREE.Fog(0x0b101e, 30, 90);
    this.camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.1, 200);
    this._camPos = new THREE.Vector3(0, 12, START_Z + 10);
    this._camLook = new THREE.Vector3(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0x9aa6c8, 1.25)); // 07-15 調亮:夜景要看得清
    const moon = new THREE.DirectionalLight(0xc2d0ea, 1.1);
    moon.position.set(-20, 30, 10);
    this.scene.add(moon);
  }

  _buildField() {
    const g = new THREE.Group();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 120),
      new THREE.MeshStandardMaterial({ color: 0x2b2536, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    g.add(ground);
    // 王宮夜廊:兩排柱廊(x=±9)+中央紅毯
    this.tents = [];
    const colMat = new THREE.MeshStandardMaterial({ color: 0x4a4258, roughness: 0.8 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x8a7a4e, roughness: 0.6 });
    for (let zi = 0; zi < 8; zi += 1) {
      for (const sx of [-9, 9]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 5.2, 10), colMat);
        col.position.set(sx, 2.6, 13 - zi * 5.4);
        g.add(col);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.5), capMat);
        cap.position.set(sx, 5.3, 13 - zi * 5.4);
        g.add(cap);
        this.tents.push(col);
      }
    }
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 46), new THREE.MeshStandardMaterial({ color: 0x5a1e28, roughness: 0.95 }));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.02, -3);
    g.add(carpet);
    // 王座台(終點方向,rout 段鏡頭會帶到)
    const dais = new THREE.Mesh(new THREE.BoxGeometry(7, 0.9, 5), new THREE.MeshStandardMaterial({ color: 0x3a3346, roughness: 0.7 }));
    dais.position.set(0, 0.45, CAMP_Z - 9);
    g.add(dais);
    const throne = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 1), new THREE.MeshStandardMaterial({ color: 0x9a7a2e, roughness: 0.4, emissive: 0x3a2a08, emissiveIntensity: 0.4 }));
    throne.position.set(0, 2, CAMP_Z - 10.4);
    g.add(throne);
    // 營火(遠處點光)
    for (const [x, z] of [[-8, CAMP_Z - 8], [6, CAMP_Z - 14], [16, CAMP_Z - 6], [-18, CAMP_Z - 12]]) {
      const fire = new THREE.PointLight(0xff9a3a, 1.3, 14);
      fire.position.set(x, 1.2, z);
      g.add(fire);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 6), new THREE.MeshBasicMaterial({ color: 0xffb03a }));
      flame.position.set(x, 0.35, z);
      g.add(flame);
    }
    // 藏身帷幔屏風(檢查點;位置沿用底座判定)
    this.rocks = [];
    const veilMat = new THREE.MeshStandardMaterial({ color: 0x5a2436, roughness: 0.95, side: THREE.DoubleSide });
    const veilMat2 = new THREE.MeshStandardMaterial({ color: 0x44305a, roughness: 0.95, side: THREE.DoubleSide });
    let vi = 0;
    for (const [x, z, s] of [[-5, 8, 1.5], [6, 3, 1.7], [-3, -4, 1.6], [7, -8, 1.4], [-8, -1, 1.3]]) {
      const veil = new THREE.Mesh(new THREE.BoxGeometry(s * 1.7, s * 1.9, 0.28), vi % 2 ? veilMat : veilMat2);
      veil.position.set(x, s * 0.95, z);
      veil.rotation.y = rand(-0.4, 0.4);
      g.add(veil);
      this.rocks.push(veil);
      vi += 1;
    }
    this.scene.add(g);
  }

  // 古裝小人(矩形身體鐵則;簡化版,巡邏兵/跟隨者/基甸共用)
  _makeFigure(robeColor, { torch = false, scale = 1 } = {}) {
    const g = new THREE.Group();
    const robe = new THREE.MeshStandardMaterial({ color: robeColor, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe6b183, roughness: 0.7, emissive: 0x5a4632, emissiveIntensity: 0.35 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x25201a });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), robe); // 矩形身體
    chest.position.y = 1.28;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.26), robe);
    skirt.position.y = 0.86;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 8), skin);
    neck.position.y = 1.66;
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 14), skin);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.225, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), new THREE.MeshStandardMaterial({ color: 0x2b2119, roughness: 0.85 }));
    hair.position.y = 0.02;
    hair.rotation.x = -0.2;
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), white);
    eL.position.set(-0.075, 0.04, 0.175);
    const eR = eL.clone(); eR.position.x = 0.075;
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 10, Math.PI), dark);
    mouth.position.set(0, -0.08, 0.165);
    mouth.rotation.z = Math.PI;
    head.add(skull, hair, eL, eR, mouth);
    head.position.y = 1.9;
    const mkLeg = (sx) => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.62, 4, 8), new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.9 }));
      leg.position.set(sx, 0.42, 0);
      return leg;
    };
    const mkArm = (sx) => {
      const pivot = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.5, 4, 8), robe);
      arm.position.y = -0.26;
      pivot.add(arm);
      pivot.position.set(sx, 1.52, 0);
      return pivot;
    };
    const legL = mkLeg(-0.12), legR = mkLeg(0.12);
    const armL = mkArm(-0.31), armR = mkArm(0.31);
    g.add(chest, skirt, neck, head, legL, legR, armL, armR);
    if (torch) { // 手持火把(巡邏兵/舉火把時)
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x5a4028 }));
      stick.position.set(0, -0.5, 0.1);
      armR.add(stick);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 6), new THREE.MeshBasicMaterial({ color: 0xffb03a }));
      flame.position.set(0, -0.85, 0.1);
      armR.add(flame);
      armR.rotation.x = -1.2;
      const light = new THREE.PointLight(0xff9a3a, 1.1, 8);
      light.position.set(0, 1.4, 0.6);
      g.add(light);
    }
    g.scale.setScalar(scale);
    g.userData = { armL, armR, legL, legR, head, mouth };
    return g;
  }

  _buildActors() {
    // 但以理(藍袍)+三同伴:哈拿尼雅/米沙利/亞撒利雅(但2:17)
    this.gideon = this._makeFigure(0x4a5f9e, { scale: 0.95 });
    this.scene.add(this.gideon);
    this.followers = [this._makeFigure(0x8a7a5a, { scale: 0.9 }), this._makeFigure(0x7a6a4a, { scale: 0.9 }), this._makeFigure(0x6a5a72, { scale: 0.9 })];
    for (const f of this.followers) this.scene.add(f);
    // 巡邏兵池(最多 5)+光錐
    this.guards = [];
    for (let i = 0; i < 5; i += 1) {
      const fig = this._makeFigure(0x71283a, { torch: true, scale: 0.95 });
      fig.visible = false;
      this.scene.add(fig);
      const cone = new THREE.Mesh(
        new THREE.CircleGeometry(1, 24, 0, 1), // 之後每幀重設角度/半徑
        new THREE.MeshBasicMaterial({ color: 0xffcf6a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
      );
      cone.rotation.x = -Math.PI / 2;
      cone.visible = false;
      this.scene.add(cone);
      this.guards.push({ fig, cone, x: 0, z: 0, dir: 0, wp: [], wpIdx: 0 });
    }
    // 護衛長 BOSS(突然出現的大獵手,照 2D 王宮之夜;分級:幼兒不出現/兒童短而慢)
    this.boss = this._makeFigure(0x181022, { torch: true, scale: 1.55 });
    this.boss.visible = false;
    this.scene.add(this.boss);
    this._bossActive = false;
    this._bossTimer = rand(26, 40); // 07-19 調軟:更晚才第一次出現
    this._bossT = 0;
    // 就位點紅圈
    this.goalRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.1, 24),
      new THREE.MeshBasicMaterial({ color: 0xff5544, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    this.goalRing.rotation.x = -Math.PI / 2;
    this.goalRing.visible = false;
    this.scene.add(this.goalRing);
    // 潰逃敵兵(InstancedMesh)
    const N = 70;
    this.routMen = new THREE.InstancedMesh(
      new THREE.CapsuleGeometry(0.16, 0.7, 4, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a86a8, roughness: 0.9 }),
      N,
    );
    this.routMen.visible = false;
    this.scene.add(this.routMen);
    this._routSeeds = Array.from({ length: N }, () => ({
      x: rand(-24, 24), z: CAMP_Z - rand(2, 22),
      vx: 0, vz: 0, angle: rand(0, Math.PI * 2),
    }));
  }

  applyPresentation({ difficulty, frames }) {
    if (DIFFICULTY_PRESETS[difficulty]) this.difficulty = difficulty;
    this.totalLegs = [1, 2, 3].includes(frames) ? frames : 2;
  }

  startMatch() {
    this.legIdx = 0;
    this.caught = 0;
    this.signalIdx = 0;
    this.signalHits = 0;
    this.playerX = 0;
    this.playerZ = START_Z;
    this.checkpoint = { x: 0, z: START_Z };
    this.routMen.visible = false;
    this._bossGone();
    this._bossTimer = rand(26, 40);
    this._setupLeg();
    this.phase = "sneak";
    this.message = "殺令已出——避開獵手火把的光,柱影間摸到紅圈!";
    this.emit("match-start", {});
    this._pushHud();
  }

  _setupLeg() {
    const p = this.preset;
    // 天亮倒數(氛圍):越後段夜色越向黎明靠(不懲罰,只有壓力感)
    const skyByLeg = [0x0b101e, 0x161228, 0x241a33];
    const sky = skyByLeg[Math.min(this.legIdx, skyByLeg.length - 1)];
    this.scene.background.set(sky);
    this.scene.fog.color.set(sky);
    // 就位點:一段一個,越後段越貼營
    const goals = [
      { x: rand(-6, 6), z: -2 },
      { x: rand(-8, 8), z: -8 },
      { x: rand(-5, 5), z: CAMP_Z + 2.5 },
    ];
    const pick = this.totalLegs === 1 ? [goals[2]] : this.totalLegs === 2 ? [goals[1], goals[2]] : goals;
    this.goal = pick[this.legIdx];
    this.goalRing.position.set(this.goal.x, 0.03, this.goal.z);
    this.goalRing.visible = true;
    // 巡邏兵:橫向來回路線,分佈在玩家與就位點之間
    for (let i = 0; i < this.guards.length; i += 1) {
      const gd = this.guards[i];
      const active = i < p.guards;
      gd.fig.visible = active;
      gd.cone.visible = active;
      if (!active) continue;
      const laneZ = THREE.MathUtils.lerp(this.playerZ - 4, this.goal.z + 2, (i + 1) / (p.guards + 1));
      const w = rand(5, 9);
      const cx = rand(-FIELD_HALF_W + w, FIELD_HALF_W - w);
      gd.wp = [{ x: cx - w, z: laneZ }, { x: cx + w, z: laneZ + rand(-1.5, 1.5) }];
      gd.wpIdx = 0;
      gd.x = gd.wp[0].x;
      gd.z = gd.wp[0].z;
    }
  }

  // ── 信號段 ──
  _bossGone() {
    this._bossActive = false;
    this.boss.visible = false;
    this._bossTimer = rand(30, 45);
  }

  _startSignals() {
    this._bossGone();
    this.phase = "signal";
    this.signalIdx = 0;
    this.signalHits = 0;
    this._meterT = 0;
    this.meterValue = 0;
    this._meterDir = 1;
    this._rollWindow();
    this.message = `到了同伴那裡!同心禱告——指針進綠區按「${SIGNALS[0].label}」!`;
    this.emit("signal-start", {});
    this._pushHud();
  }

  _rollWindow() {
    const w = this.preset.window;
    this.windowStart = rand(0.45, 0.9 - w);
    this.windowEnd = this.windowStart + w;
  }

  pressSignal(key) {
    if (this.phase !== "signal") return;
    const expect = SIGNALS[this.signalIdx].key;
    if (key !== expect) { // 按錯鍵=提示,不懲罰
      this.emit("signal-wrong", { expect: SIGNALS[this.signalIdx].label });
      return;
    }
    const inWindow = this.meterValue >= this.windowStart && this.meterValue <= this.windowEnd;
    if (inWindow) {
      this.signalHits += 1;
      this.cameraShake = 0.16;
      this.emit("signal-hit", { idx: this.signalIdx, label: SIGNALS[this.signalIdx].label, phrase: SIGNALS[this.signalIdx].phrase });
      this.signalIdx += 1;
      if (this.signalIdx >= SIGNALS.length) {
        this._startRout();
        return;
      }
      this._rollWindow();
      this.message = `好!下一個——指針進綠區按「${SIGNALS[this.signalIdx].label}」!`;
    } else {
      this.emit("signal-miss", { label: SIGNALS[this.signalIdx].label });
      this.message = `還沒到時候……再等指針進綠區,按「${SIGNALS[this.signalIdx].label}」!`;
    }
    this._pushHud();
  }

  _startRout() {
    this.phase = "rout";
    this._routT = 5.2;
    this.scene.background.set(0x8a6040); // 天亮了
    this.scene.fog.color.set(0x8a6040);
    this.routMen.visible = true;
    for (const s of this._routSeeds) {
      const a = s.angle;
      s.vx = Math.cos(a) * rand(2.5, 5);
      s.vz = Math.abs(Math.sin(a)) * -rand(2.5, 5) - 1; // 往營後逃
    }
    this.cameraShake = 0.3;
    this.emit("rout", { hits: this.signalHits });
    this.message = "奧祕在夜間異象中顯明了!天亮了——哲士都得救了!";
    this._pushHud();
  }

  _finish() {
    this.phase = "done";
    const perfect = this.caught === 0;
    this.emit("match-end", {
      title: perfect ? "夜間異象顯明奧祕!完美潛行!🌟" : "奧祕顯明!但以理稱頌天上的神!👑",
      text: `被獵手發現 ${this.caught} 次${perfect ? "(完美潛行!)" : ""}。「他顯明深奧隱祕的事,知道暗中所有的,光明也與他同居。」(但2:22)——智慧能力都屬乎神,不屬乎我們。`,
      caught: this.caught,
    });
    this._pushHud();
  }

  cycleCamView() {
    this.camView = (this.camView + 1) % 5;
    try { localStorage.setItem("daniel-palace3d-camview", String(this.camView)); } catch { /* ignore */ }
    this.emit("status", { text: ["視角:隊伍後上方。", "視角:低角跟隨。", "視角:高空俯瞰。", "視角:殿廊側面。", "視角:紅圈回看。"][this.camView] });
  }

  update(dt) {
    if (this.phase === "menu" || this.phase === "done") return;
    const p = this.preset;
    if (this.phase === "sneak") {
      // 玩家移動(鏡頭固定朝 -z,不需鏡像)
      const spd = 4.8; // 07-19 調軟:玩家加速,更好穿越掃描
      this.playerX = clamp(this.playerX + this.move.x * spd * dt, -FIELD_HALF_W, FIELD_HALF_W);
      this.playerZ = clamp(this.playerZ + this.move.z * spd * dt, CAMP_Z + 1.2, START_Z + 2);
      // 巡邏兵走路+偵測(0.35s 寬限:掃到不秒抓,持續照到才算——07-19 調軟)
      let spotted = false;
      for (let i = 0; i < p.guards; i += 1) {
        const gd = this.guards[i];
        const wp = gd.wp[gd.wpIdx];
        const dx = wp.x - gd.x, dz = wp.z - gd.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) gd.wpIdx = (gd.wpIdx + 1) % gd.wp.length;
        else {
          gd.x += (dx / d) * p.speed * dt;
          gd.z += (dz / d) * p.speed * dt;
          gd.dir = Math.atan2(dx, dz);
        }
        // 光錐偵測(判定=畫面:錐形參數同渲染)
        const px = this.playerX - gd.x, pz = this.playerZ - gd.z;
        const dist = Math.hypot(px, pz);
        if (dist < p.range) {
          const ang = Math.atan2(px, pz);
          let diff = ang - gd.dir;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) < p.fov) spotted = true;
        }
      }
      if (spotted) {
        this._exposeT = (this._exposeT || 0) + dt;
        if (this._exposeT > 0.35) { this._exposeT = 0; this._caught(); }
      } else {
        this._exposeT = Math.max(0, (this._exposeT || 0) - dt * 2);
      }
      // 護衛長 BOSS:突然出現直追(照 2D 王宮之夜;幼兒檔不出現、兒童檔短而慢;被抓=同溫柔規則)
      if (this.difficulty !== "kids") {
        if (!this._bossActive) {
          this._bossTimer -= dt;
          if (this._bossTimer <= 0) {
            this._bossActive = true;
            this._bossT = { child: 4, easy: 5, normal: 6.5, hard: 7.5 }[this.difficulty] || 5;
            this.boss.visible = true;
            const side = Math.random() < 0.5 ? -1 : 1;
            this.boss.position.set(side * (FIELD_HALF_W - 1), 0, clamp(this.playerZ - 14, CAMP_Z + 2, START_Z));
            this.cameraShake = 0.35;
            this.emit("boss", {});
            this.message = "護衛長來了!快跑、躲進帷幔柱影!";
            this._pushHud();
          }
        } else {
          const bs = { child: 2.6, easy: 3.6, normal: 4.4, hard: 5.0 }[this.difficulty] || 3.6; // 玩家 4.8:easy 以下追不上,normal 以上要躲柱影
          const bdx = this.playerX - this.boss.position.x, bdz = this.playerZ - this.boss.position.z;
          const bd = Math.hypot(bdx, bdz);
          if (bd > 0.001) {
            this.boss.position.x += (bdx / bd) * bs * dt;
            this.boss.position.z += (bdz / bd) * bs * dt;
            this.boss.rotation.y = Math.atan2(bdx, bdz);
          }
          if (bd < 1.15) {
            this._bossGone();
            this._caught();
          } else {
            this._bossT -= dt;
            if (this._bossT <= 0) this._bossGone();
          }
        }
      }
      // 檢查點:碰到岩石附近就更新
      for (const rock of this.rocks) {
        if (Math.hypot(rock.position.x - this.playerX, rock.position.z - this.playerZ) < 2.2) {
          this.checkpoint = { x: this.playerX, z: this.playerZ };
        }
      }
      // 抵達就位點
      if (Math.hypot(this.goal.x - this.playerX, this.goal.z - this.playerZ) < 1.1) {
        this.legIdx += 1;
        if (this.legIdx >= this.totalLegs) {
          this.goalRing.visible = false;
          this._startSignals();
        } else {
          this.checkpoint = { x: this.playerX, z: this.playerZ };
          this._setupLeg();
          this.emit("leg", { n: this.legIdx + 1 });
          this.message = `好位置!繼續前進到下一個紅圈(第 ${this.legIdx + 1}/${this.totalLegs} 段)。`;
        }
      }
    } else if (this.phase === "signal") {
      // 指針來回掃
      const sweep = 0.55 + p.speed * 0.14;
      this.meterValue += this._meterDir * sweep * dt;
      if (this.meterValue >= 1) { this.meterValue = 1; this._meterDir = -1; }
      if (this.meterValue <= 0) { this.meterValue = 0; this._meterDir = 1; }
    } else if (this.phase === "rout") {
      this._routT -= dt;
      const dummy = new THREE.Object3D();
      for (let i = 0; i < this._routSeeds.length; i += 1) {
        const s = this._routSeeds[i];
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        dummy.position.set(s.x, 0.55 + Math.abs(Math.sin(performance.now() / 90 + i)) * 0.12, s.z);
        dummy.rotation.y = Math.atan2(s.vx, s.vz);
        dummy.updateMatrix();
        this.routMen.setMatrixAt(i, dummy.matrix);
      }
      this.routMen.instanceMatrix.needsUpdate = true;
      if (this._routT <= 0) this._finish();
    }
    this.cameraShake = Math.max(0, this.cameraShake - dt * 1.6);
    if (this._caughtT > 0) this._caughtT -= dt;
    this._hudTimer -= dt;
    if (this._hudTimer <= 0) { this._hudTimer = 0.12; this._pushHud(); }
  }

  _caught() {
    if (this._caughtT > 0) return; // 免疫窗(避免連環觸發)
    this.caught += 1;
    this._caughtT = 1.6;
    this.cameraShake = 0.22;
    this.playerX = this.checkpoint.x;
    this.playerZ = this.checkpoint.z;
    this.emit("caught", { n: this.caught });
    this.message = "被火把照到了!退回藏身點——貼著帷幔柱影走。";
    this._pushHud();
  }

  _pushHud() {
    if (!this.onHud) return;
    this.onHud({
      phase: this.phase,
      message: this.message,
      legIdx: Math.min((this.legIdx ?? 0) + 1, this.totalLegs),
      totalLegs: this.totalLegs,
      caught: this.caught ?? 0,
      signalIdx: this.signalIdx ?? 0,
      signalLabel: this.phase === "signal" ? SIGNALS[this.signalIdx]?.label : "",
      meterValue: this.meterValue ?? 0,
      windowStart: this.windowStart ?? 0,
      windowEnd: this.windowEnd ?? 0,
    });
  }

  render(dt) {
    const t = performance.now() / 1000;
    // 基甸+跟隨者
    this.gideon.position.set(this.playerX, 0, this.playerZ);
    const moving = Math.abs(this.move.x) + Math.abs(this.move.z) > 0.01 && this.phase === "sneak";
    if (moving) {
      this.gideon.rotation.y = Math.atan2(this.move.x, this.move.z);
      const sw = Math.sin(t * 9) * 0.5;
      this.gideon.userData.armL.rotation.x = sw;
      this.gideon.userData.armR.rotation.x = -sw;
    } else {
      this.gideon.userData.armL.rotation.x *= Math.max(0, 1 - dt * 8);
      this.gideon.userData.armR.rotation.x *= Math.max(0, 1 - dt * 8);
    }
    if (this.phase === "signal") {
      // 舉手預備/依信號進度換姿勢
      this.gideon.rotation.y = Math.PI; // 面向營地
      this.gideon.userData.armR.rotation.x = -2.4; // 高舉
      if (this.signalIdx >= 2) this.gideon.userData.armL.rotation.x = -2.4;
    }
    this.followers.forEach((f, i) => {
      const tx = this.playerX + [-1.2, 1.2, 0][i];
      const tz = this.playerZ + (i === 2 ? 2.3 : 1.4);
      f.position.x += (tx - f.position.x) * Math.min(1, dt * 4);
      f.position.z += (tz - f.position.z) * Math.min(1, dt * 4);
      f.rotation.y = this.gideon.rotation.y;
      if (this.phase === "signal") f.userData.armR.rotation.x = -2.4;
    });
    // 巡邏兵+光錐
    for (let i = 0; i < this.guards.length; i += 1) {
      const gd = this.guards[i];
      if (!gd.fig.visible) continue;
      gd.fig.position.set(gd.x, 0, gd.z);
      gd.fig.rotation.y = gd.dir;
      const p = this.preset;
      gd.cone.geometry.dispose();
      gd.cone.geometry = new THREE.CircleGeometry(p.range, 24, Math.PI / 2 - p.fov, p.fov * 2);
      gd.cone.position.set(gd.x, 0.05, gd.z);
      gd.cone.rotation.z = -gd.dir; // 錐面朝行進方向(rotation.x=-π/2 之後 z 軸掌方位)
    }
    // 護衛長追擊擺臂
    if (this._bossActive) {
      const bsw = Math.sin(t * 11) * 0.7;
      this.boss.userData.armL.rotation.x = bsw;
      this.boss.userData.armR.rotation.x = -1.2; // 舉火把追
      this.boss.userData.legL.rotation.x = bsw * 0.6;
      this.boss.userData.legR.rotation.x = -bsw * 0.6;
    }
    // 就位點呼吸
    if (this.goalRing.visible) {
      this.goalRing.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
    }
    // 被抓紅閃(苦臉)
    if (this.gideon.userData.mouth) this.gideon.userData.mouth.rotation.z = this._caughtT > 0 ? 0 : Math.PI;
    // 鏡頭(固定朝 -z 家族=不觸鏡像鐵則)
    let tPos, tLook;
    const px = this.playerX, pz = this.playerZ;
    if (this.camView === 1) {
      tPos = new THREE.Vector3(px, 3.4, pz + 7);
      tLook = new THREE.Vector3(px, 1, pz - 6);
    } else if (this.camView === 2) {
      tPos = new THREE.Vector3(px, 30, pz + 2);
      tLook = new THREE.Vector3(px, 0, pz - 3);
    } else if (this.camView === 3) {
      tPos = new THREE.Vector3(px - 16, 6, pz - 2);
      tLook = new THREE.Vector3(px, 0.8, pz - 2);
    } else if (this.camView === 4) {
      tPos = new THREE.Vector3(this.goal ? this.goal.x : 0, 4, (this.goal ? this.goal.z : 0) - 6);
      tLook = new THREE.Vector3(px, 0.8, pz);
    } else {
      tPos = new THREE.Vector3(px * 0.75, 11, pz + 11);
      tLook = new THREE.Vector3(px * 0.85, 0, pz - 4);
    }
    if (this.phase === "rout") {
      tPos = new THREE.Vector3(px, 16, pz + 8);
      tLook = new THREE.Vector3(0, 0, CAMP_Z - 8);
    }
    const k = 1 - Math.exp(-dt * 3.4);
    this._camPos.lerp(tPos, k);
    this._camLook.lerp(tLook, k);
    const sh = this.cameraShake;
    this.camera.position.set(this._camPos.x + rand(-sh, sh) * 0.4, this._camPos.y + rand(-sh, sh) * 0.3, this._camPos.z);
    this.camera.lookAt(this._camLook);
    this.renderer.render(this.scene, this.camera);
  }

  startLoop() {
    if (this._running) return;
    this._running = true;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this.update(dt);
      this.render(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
