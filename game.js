/* にゃんチェイス - UI / ゲーム進行
   Ver1.5.2 開発基盤版
   修正: 探索開始直後に actionLocked=true にして二重行動を防止。
*/
(() => {
  const E=NyanEngine;
  const A=NyanAnimation;
  const Audio=NyanAudio;
  const Online=window.NyanOnline;
  let game;
  let toastTimer=null;
  let victoryCutinTimer=null;
  let playMode="local"; // local | cpuPolice | cpuCat
  let cpuTimer=null;
  let cpuDifficulty="normal"; // easy | normal | hard
  let pendingCpuSide="cat"; // cat => player cat, police => player police

  let cpuMemory={
    lastDogNodes:[null,null,null],
    discoveredTrackBoxes:[],
    emptyBoxes:new Set(),
    recentTargets:[],
    thoughtText:""
  };
  let cpuCatRoute=[];

  const $=id=>document.getElementById(id);
  const board=$("board");
  const modeOverlay=$("modeOverlay"),localModeBtn=$("localModeBtn"),cpuModeBtn=$("cpuModeBtn");
  const onlineModeBtn=$("onlineModeBtn"),onlineOverlay=$("onlineOverlay");
  const onlineCloseBtn=$("onlineCloseBtn"),onlineCreateRoomBtn=$("onlineCreateRoomBtn");
  const onlineCreatePanel=$("onlineCreatePanel"),onlineRoomPanel=$("onlineRoomPanel");
  const onlineRoomCode=$("onlineRoomCode"),onlineCopyCodeBtn=$("onlineCopyCodeBtn");
  const onlineWaitCard=$("onlineWaitCard"),onlineWaitTitle=$("onlineWaitTitle"),onlineWaitText=$("onlineWaitText");
  const onlineReadyCard=$("onlineReadyCard"),onlineCancelRoomBtn=$("onlineCancelRoomBtn"),onlineError=$("onlineError");
  const cpuSideOverlay=$("cpuSideOverlay"),playCatSideBtn=$("playCatSideBtn"),playPoliceSideBtn=$("playPoliceSideBtn"),cpuSideBackBtn=$("cpuSideBackBtn");
  const difficultyOverlay=$("difficultyOverlay"),cpuEasyBtn=$("cpuEasyBtn"),cpuNormalBtn=$("cpuNormalBtn"),
        cpuHardBtn=$("cpuHardBtn"),difficultyBackBtn=$("difficultyBackBtn");
  const titleSettingsBtn=$("titleSettingsBtn"),howToBtn=$("howToBtn"),soundQuickBtn=$("soundQuickBtn");
  const turnDisplay=$("turnDisplay");
  const phaseDisplay=$("phaseDisplay"),guideDisplay=$("guideDisplay");
  const dogCards=[$("dogCard0"),$("dogCard1"),$("dogCard2")];
  const dogRow=$("dogRow"),tracksSummary=$("tracksSummary"),tracksFoundCount=$("tracksFoundCount");
  const routeRevealPanel=$("routeRevealPanel"),routeRevealSub=$("routeRevealSub");
  const message=$("message");
  const catViewBtn=$("catViewBtn"),settingsBtn=$("settingsBtn");
  const finishDogTurnBtn=$("finishDogTurnBtn");
  const privacyOverlay=$("privacyOverlay"),privacyIcon=$("privacyIcon");
  const privacyTitle=$("privacyTitle"),privacyText=$("privacyText"),privacyBtn=$("privacyBtn");
  const victoryCutin=$("victoryCutin"),victoryCutinImage=$("victoryCutinImage");
  const resultOverlay=$("resultOverlay"),resultIcon=$("resultIcon");
  const resultTitle=$("resultTitle"),resultText=$("resultText"),againBtn=$("againBtn");
  const resultRoute=$("resultRoute"),resultRouteBoard=$("resultRouteBoard"),resultRouteNote=$("resultRouteNote");
  const settingsOverlay=$("settingsOverlay"),sfxToggleBtn=$("sfxToggleBtn"),bgmToggleBtn=$("bgmToggleBtn");
  const vibrationToggleBtn=$("vibrationToggleBtn"),sfxState=$("sfxState"),bgmState=$("bgmState");
  const vibrationState=$("vibrationState"),settingsCloseBtn=$("settingsCloseBtn");
  const bgmVolumeSlider=$("bgmVolumeSlider"),bgmVolumeValue=$("bgmVolumeValue");
  const restartFromSettingsBtn=$("restartFromSettingsBtn"),backToTitleBtn=$("backToTitleBtn");
  const toast=$("toast"),toastIcon=$("toastIcon"),toastTitle=$("toastTitle"),toastText=$("toastText");
  const lastTurnBanner=$("lastTurnBanner"),phaseCue=$("phaseCue"),phaseCueIcon=$("phaseCueIcon"),phaseCueText=$("phaseCueText");
  let lastRenderedPhase=null;
  let lastTurnStingerPlayed=false;
  const motionStatus=$("motionStatus"),confettiLayer=$("confettiLayer");

  function bindPress(el,fn){
    if(!el)return;

    let lastFire=0;

    const fire=(e)=>{
      if(el.disabled)return;

      const now=Date.now();
      if(now-lastFire<350)return;
      lastFire=now;

      if(e){
        e.preventDefault();
        e.stopPropagation();
      }

      try{
        const unlock=Audio.unlockAudio();
        if(unlock && typeof unlock.then==="function"){
          unlock.then(()=>Audio.startBgm()).catch(()=>{});
        }else{
          Audio.startBgm();
        }
      }catch(err){
        // Audio must never block UI navigation.
      }

      fn(e);
    };

    if(window.PointerEvent){
      el.addEventListener("pointerup",fire,{passive:false});
    }else{
      el.addEventListener("touchend",fire,{passive:false});
    }

    el.addEventListener("click",fire,{passive:false});
  }

  function initGame(showMode=false){
    game=E.createState();
    clearTimeout(cpuTimer);
    clearTimeout(victoryCutinTimer);
    if(victoryCutin){
      victoryCutin.classList.remove("show","closing");
      victoryCutin.setAttribute("aria-hidden","true");
    }
    cpuMemory={
      lastDogNodes:[null,null,null],
      discoveredTrackBoxes:[],
      emptyBoxes:new Set(),
      recentTargets:[],
      thoughtText:""
    };
    cpuCatRoute=[];
    lastTurnStingerPlayed=false;
    privacyOverlay.classList.remove("show");
    resultOverlay.classList.remove("show");
    if(onlineOverlay) onlineOverlay.classList.remove("show");
    if(Online) Online.reset();
    if(resultRoute) resultRoute.classList.remove("show");
    if(resultRouteBoard) if(resultRouteBoard) resultRouteBoard.innerHTML="";
    if(resultRouteNote) resultRouteNote.textContent="";
    settingsOverlay.classList.remove("show");
    hideToast();
    if(routeRevealPanel) routeRevealPanel.classList.remove("show");
    clearRouteReveal();
    setMessage("🐕 0ターン目。まず柴犬警察3匹を配置してください。");
    if(showMode){
      modeOverlay.classList.add("show");
      Audio.setBgmMode("home");
    }
    render();
  }


  function resetOnlineUI(){
    if(onlineCreatePanel) onlineCreatePanel.hidden=false;
    if(onlineRoomPanel) onlineRoomPanel.hidden=true;
    if(onlineReadyCard) onlineReadyCard.hidden=true;
    if(onlineWaitCard) onlineWaitCard.hidden=false;
    if(onlineRoomCode) onlineRoomCode.textContent="------";
    if(onlineError){
      onlineError.hidden=true;
      onlineError.textContent="";
    }
    if(onlineCreateRoomBtn){
      onlineCreateRoomBtn.disabled=false;
      onlineCreateRoomBtn.textContent="部屋を作る";
    }
  }

  function openOnlineMode(){
    resetOnlineUI();
    if(onlineOverlay) onlineOverlay.classList.add("show");
  }

  function closeOnlineMode(){
    if(Online) Online.reset();
    if(onlineOverlay) onlineOverlay.classList.remove("show");
    resetOnlineUI();
  }

  function showOnlineError(message){
    if(!onlineError)return;
    onlineError.textContent=message;
    onlineError.hidden=false;
  }

  async function createOnlineRoom(){
    if(!Online)return;
    if(onlineError) onlineError.hidden=true;
    onlineCreateRoomBtn.disabled=true;
    onlineCreateRoomBtn.textContent="部屋を作成中…";

    try{
      const data=await Online.createRoom();

      onlineRoomCode.textContent=data.roomCode;
      onlineCreatePanel.hidden=true;
      onlineRoomPanel.hidden=false;
      onlineWaitCard.hidden=false;
      onlineReadyCard.hidden=true;

      Online.connect({
        onOpen:()=>{
          onlineWaitTitle.textContent="相手を待っています…";
          onlineWaitText.textContent="もう1台のスマホでこのコードを入力してください";
        },
        onPresence:(presence)=>{
          if(presence.ready){
            onlineWaitCard.hidden=true;
            onlineReadyCard.hidden=false;
            Audio.haptic([25,30,50]);
          }else{
            onlineWaitCard.hidden=false;
            onlineReadyCard.hidden=true;
          }
        },
        onClose:()=>{
          if(!onlineRoomPanel.hidden && onlineReadyCard.hidden){
            onlineWaitTitle.textContent="接続を確認しています…";
          }
        },
        onError:()=>{
          showOnlineError("通信に失敗しました。ネット接続を確認して、もう一度試してください。");
        }
      });
    }catch(error){
      console.error("Online room create failed",error);
      onlineCreateRoomBtn.disabled=false;
      onlineCreateRoomBtn.textContent="部屋を作る";

      if(error?.message==="could_not_create_room"){
        showOnlineError("部屋を作れませんでした。少し待ってからもう一度試してください。");
      }else{
        showOnlineError("オンラインサーバーに接続できませんでした。");
      }
    }
  }

  async function copyOnlineCode(){
    const code=onlineRoomCode?.textContent?.trim();
    if(!code || code==="------")return;
    try{
      await navigator.clipboard.writeText(code);
      onlineCopyCodeBtn.textContent="コピーしました！";
      setTimeout(()=>onlineCopyCodeBtn.textContent="コードをコピー",900);
    }catch(_){
      onlineCopyCodeBtn.textContent=code;
    }
  }

  function startLocalMode(){
    playMode="local";
    modeOverlay.classList.remove("show");
    Audio.setBgmMode("normal");
    Audio.play("gamestart");
    initGame(false);
    showPrivacy("🐕","0ターン目・警察配置",
      "まず柴犬警察3匹を中央16交差点に配置してください。配置後にネコがスタート地点を選びます。");
    render();
  }

  function startCpuPoliceMode(){
    modeOverlay.classList.remove("show");
    cpuSideOverlay.classList.add("show");
  }

  function chooseCpuSide(side){
    pendingCpuSide=side;
    cpuSideOverlay.classList.remove("show");
    difficultyOverlay.classList.add("show");
  }

  function closeCpuSidePicker(){
    cpuSideOverlay.classList.remove("show");
    modeOverlay.classList.add("show");
    Audio.setBgmMode("home");
  }

  function beginCpuPoliceGame(difficulty){
    cpuDifficulty=difficulty;
    difficultyOverlay.classList.remove("show");
    Audio.setBgmMode("normal");
    Audio.play("gamestart");

    if(pendingCpuSide==="cat"){
      playMode="cpuPolice";
      initGame(false);
      cpuSetupDogs();
      game.phase="catSetup";
      game.turn=1;

      const label={easy:"やさしい",normal:"ふつう",hard:"つよい"}[cpuDifficulty];
      showPrivacy("🐱","逃走1ターン目・ネコの番",
        `CPU柴犬警察（${label}）の配置が完了しました。配置を見て、スタート地点にする箱を1つ選んでください。`);
      setMessage("🐱 柴犬の配置を見て、好きな箱に隠れよう。");
      render();
      return;
    }

    // Player = police / CPU = cat
    playMode="cpuCat";
    initGame(false);
    game.phase="dogSetup";
    game.turn=0;

    const label={easy:"やさしい",normal:"ふつう",hard:"つよい"}[cpuDifficulty];
    showPrivacy("🐕","0ターン目・警察配置",
      `CPUネコ（${label}）と対戦します。まず柴犬警察3匹を中央16交差点に配置してください。`);
    setMessage("🐕 柴犬警察3匹を配置しよう。配置後、CPUネコが隠れます。");
    render();
  }

  function closeDifficultyPicker(){
    difficultyOverlay.classList.remove("show");
    cpuSideOverlay.classList.add("show");
  }

  function render(){
    renderBoard();

    // A complete board has 25 boxes + 36 intersections.
    // Rebuild once if Safari restored a stale/incomplete DOM snapshot.
    if(board.querySelectorAll(".box").length!==E.BOX_COUNT ||
       board.querySelectorAll(".node").length!==E.NODE_COUNT){
      board.innerHTML="";
      renderBoard();
    }

    renderStatus();
    renderDogCards();
    renderControls();
  }

  function renderBoard(){
    board.innerHTML="";

    for(let i=0;i<E.BOX_COUNT;i++){
      const r=E.boxRow(i),c=E.boxCol(i),b=document.createElement("button");
      b.type="button";
      b.className="box";
      b.dataset.boxIndex=String(i);
      // iPhone Safari compatibility:
      // avoid CSS calc() multiplication/division and place cells with simple percentages.
      b.style.left=`${5 + c*19}%`;
      b.style.top=`${5 + r*19}%`;
      b.style.width="14%";
      b.style.height="14%";

      if(game.phase==="catSetup"){
        b.classList.add("setup-cat-choice");
      }

      if(game.phase==="cat"&&game.catVisible){
        if(game.catHistory.has(i)&&i!==game.catPos)b.classList.add("cat-visited");
        if(i===game.catPos)b.classList.add("cat-current");
        if(E.getCatLegalMoves(game).includes(i)){
          b.classList.add("cat-valid");
          if(E.isCatDeadEnd(game,i))b.classList.add("cat-danger");
        }
      }

      if(game.phase==="dogs"&&game.selectedDog!==null&&!game.dogAction[game.selectedDog]&&!game.actionLocked){
        if(E.getBoxesAroundNode(game.dogs[game.selectedDog]).includes(i))b.classList.add("searchable");
      }

      if(game.phase!=="cat"&&game.revealedTracks.has(i)){
        b.classList.add("revealed");
        if(game.catHistory.get(i)===1)b.classList.add("start-track");
      }

      b.innerHTML=`<span class="boxnum">${i+1}</span>
        <img class="box-art" src="./assets/images/box.png" alt="">
        ${playMode!=="cpuCat"&&game.phase==="cat"&&game.catVisible&&game.catPos===i?'<span class="cat"><img class="cat-art" src="./assets/images/cat_play_normal.png" alt="ネコ"></span>':""}
        ${privateHistoryHTML(i)}
        ${publicTrackHTML(i)}
        ${game.phase==="cat"&&game.catVisible&&E.isCatDeadEnd(game,i)?'<span class="danger-mark">⚠️</span>':""}`;

      if(game.phase==="catSetup"){
        b.addEventListener("pointerdown",e=>{
          if(game.phase!=="catSetup"||game.actionLocked||game.gameOver)return;
          e.preventDefault();
          e.stopPropagation();
          handleBoxPress(i);
        },{passive:false});
        b.addEventListener("touchstart",e=>{
          if(game.phase!=="catSetup"||game.actionLocked||game.gameOver)return;
          e.preventDefault();
          e.stopPropagation();
          handleBoxPress(i);
        },{passive:false});
      }else{
        bindPress(b,()=>handleBoxPress(i));
      }
      board.appendChild(b);
    }

    for(let i=0;i<E.NODE_COUNT;i++){
      const r=E.nodeRow(i),c=E.nodeCol(i),n=document.createElement("button");
      n.type="button";
      n.className="node";
      n.style.left=`${2.5 + c*19}%`;
      n.style.top=`${2.5 + r*19}%`;

      if(!E.isActiveDogNode(i)){n.classList.add("inactive");n.disabled=true;}
      if(game.phase==="catSetup"){n.disabled=true;}
      if(game.phase==="dogSetup"&&E.isActiveDogNode(i))n.classList.add("setup");
      if(game.selectedDog!==null&&game.dogs[game.selectedDog]===i)n.classList.add("selected");

      if(game.phase==="dogs"&&game.selectedDog!==null&&!game.dogAction[game.selectedDog]&&!game.actionLocked
         &&E.getDogLegalMoves(game,game.selectedDog).includes(i)){
        n.classList.add("move");
      }

      const here=game.dogs.map((p,j)=>p===i?j:-1).filter(j=>j>=0);
      if(here.length){
        const s=document.createElement("span");
        s.className="dogstack";
        here.forEach(j=>{
          const t=document.createElement("span");
          t.className=`dogtoken ${E.DOGS[j].token}`;
          const dogImg=["dog_red.png","dog_green.png","dog_blue.png"][j];
          t.innerHTML=`<img src="./assets/images/${dogImg}" alt="${E.DOGS[j].name}">`;
          s.appendChild(t);
        });
        n.appendChild(s);
      }

      if(!n.disabled)bindPress(n,()=>handleNodePress(i));
      board.appendChild(n);
    }
  }

  function privateHistoryHTML(i){
    if(playMode==="cpuCat")return"";
    if(game.phase!=="cat"||!game.catVisible||!game.catHistory.has(i))return"";
    if(game.catHistory.get(i)===1){
      return'<span class="private-foot private-start"><img src="./assets/images/start.png" alt="スタート"></span>';
    }
    return'<span class="private-foot"><img src="./assets/images/paw.png" alt="足跡"></span>';
  }

  function shouldShowTrackTurn(turn){
    // ターン数字は「プレイヤー＝警察 / CPUネコ戦」の難易度ヒントだけ。
    if(playMode!=="cpuCat") return false;
    if(cpuDifficulty==="easy") return turn===3||turn===6||turn===9;
    if(cpuDifficulty==="normal") return turn===6;
    return false; // hard / つよい
  }

  function publicTrackHTML(i){
    if(game.phase==="cat"||!game.revealedTracks.has(i))return"";
    const turn=game.revealedTracks.get(i) ?? game.catHistory.get(i);
    const turnBadge=shouldShowTrackTurn(turn)
      ?`<b class="track-turn">${turn}</b>`
      :"";

    if(game.catHistory.get(i)===1){
      return`<span class="track-badge"><img class="start-art" src="./assets/images/start.png" alt="START">${turnBadge}</span>`;
    }
    return`<span class="track-badge"><img class="track-art" src="./assets/images/paw.png" alt="足跡">${turnBadge}</span>`;
  }


  function handleBoxPress(i){
    if(game.gameOver||game.actionLocked)return;
    A.tapPopBox(board,i);

    if(game.phase==="catSetup"){
      // The exact tapped cardboard is the starting position.
      // Nodes are disabled during this phase so mobile taps cannot be stolen.
      game.actionLocked=true;
      const chosenStart=Number(i);

      A.tapPopBox(board,chosenStart);
      Audio.play("cat");
      Audio.haptic(16);

      cpuTimer=setTimeout(()=>{
        game.catPos=chosenStart;
        game.catHistory.clear();
        game.catHistory.set(chosenStart,1);
        game.catVisible=false;
        game.turn=1;
        game.phase="dogs";
        game.selectedDog=null;
        game.dogAction=[false,false,false];
        game.cpuSearchesThisTurn=0;
        game.actionLocked=false;

        showPhaseCue("🐕","柴犬警察の捜査！");

        if(playMode==="cpuPolice"){
          setMessage("🤖 CPU柴犬警察が捜査中…");
          render();
          cpuTimer=setTimeout(runCpuPoliceTurn,650);
        }else{
          showPrivacy("🐕","柴犬警察の番",
            "ネコが隠れました。現在地は秘密です。柴犬警察が捜査を開始します。");
          setMessage("🐕 柴犬を選択。緑の交差点＝移動、青い箱＝探索です。");
          render();
        }
      },180);

      return;
    }

    if(game.phase==="cat"){
      if(!game.catVisible){
        setMessage("まず「👀 ネコ位置を見る」をタップしてください。");
        return;
      }

      if(!E.getCatLegalMoves(game).includes(i)){
        Audio.play("invalid");
        setMessage("グレー＝移動不可。緑＝11ターン目まで逃げ切れる道あり、赤⚠️＝残りターンを逆算すると詰みです。");
        return;
      }

      const dead=E.isCatDeadEnd(game,i);
      const from=game.catPos;

      // 猫移動中も入力ロック
      game.actionLocked=true;
      Audio.haptic(10);
      Audio.play("cat");

      A.animateCatMove(board,from,i,()=>{
        game.catPos=i;
        game.catHistory.set(i,game.turn);
        game.catVisible=false;

        // 1〜10ターン目は、次の逃げ道が無ければ警察勝利。
        // 11ターン目は次の12ターン目が存在しないため、
        // 行き止まりでもそのまま警察の最終捜索へ進む。
        if(game.turn<E.MAX_TURNS && (dead||E.getCatLegalMoves(game).length===0)){
          game.actionLocked=false;
          endGame("dogs","ネコが行き止まりに入り、次の逃げ道がなくなりました！");
          return;
        }

        game.phase="dogs";
        game.selectedDog=null;
        game.dogAction=[false,false,false];
        game.cpuSearchesThisTurn=0;
        game.actionLocked=false;

        if(playMode==="cpuPolice"){
          setMessage("🤖 柴犬警察CPUが捜査中…");
          render();
          cpuTimer=setTimeout(runCpuPoliceTurn,550);
        }else{
          showPrivacy("🐕","柴犬警察の番",
            "ネコの移動が完了しました。現在地と未発見の足跡は隠れています。");
          setMessage("🐕 柴犬を選択すると、緑の交差点へ移動・青い箱を探索できます。");
          render();
        }
      });
      render();
      return;
    }

    if(game.phase==="dogs"&&game.selectedDog!==null&&!game.dogAction[game.selectedDog]){
      const di=game.selectedDog;
      if(!E.getBoxesAroundNode(game.dogs[di]).includes(i)){
        setMessage("青く光っている箱から1つ選んでください。");
        return;
      }
      performSearch(di,i);
    }
  }

  function handleNodePress(i){
    if(game.gameOver||game.actionLocked||!E.isActiveDogNode(i))return;

    if(game.phase==="dogSetup"){
      if(playMode==="cpuPolice") return;

      if(game.dogs.includes(i)){
        setMessage("その交差点にはすでに柴犬がいます。");
        return;
      }

      const di=game.dogSetupCount;
      game.dogs[di]=i;
      game.dogSetupCount++;

      if(game.dogSetupCount>=3){
        if(playMode==="cpuCat"){
          game.phase="catSetup";
          game.turn=1;
          setMessage("🐱 CPUネコが隠れ場所を考えています…");
          render();
          cpuTimer=setTimeout(cpuCatInitialHide,250);
          return;
        }

        game.phase="catSetup";
        game.turn=1;
        showPrivacy("🐱","逃走1ターン目・ネコの番",
          "柴犬警察の配置を確認して、スタート地点にする箱を1つ選んでください。");
        setMessage("🐱 柴犬の配置を見て、好きな箱に隠れよう。");
      }else{
        setMessage(`${E.DOGS[di].label} ${E.DOGS[di].name} を配置しました。次の柴犬を配置してください。`);
      }

      render();
      return;
    }

    if(game.phase!=="dogs")return;

    const tapped=game.dogs.findIndex(p=>p===i);
    if(tapped!==-1){
      selectDog(tapped);
      return;
    }

    if(game.selectedDog!==null&&!game.dogAction[game.selectedDog]){
      const di=game.selectedDog;

      if(!E.getDogLegalMoves(game,di).includes(i)){
        setMessage("緑色に光っている交差点へ1マス移動できます。");
        return;
      }

      // 移動は即時確定。以後この犬は行動不可。
      Audio.play("move");
      game.dogs[di]=i;
      game.dogAction[di]="move";
      game.selectedDog=null;
      setMessage(`${E.DOGS[di].label} ${E.DOGS[di].name} は移動済み✓。`);
      afterDogAction();
      render();
    }
  }

  function selectDog(di){
    if(playMode!=="local"&&playMode!=="cpuCat")return;
    if(game.phase!=="dogs"||game.gameOver||game.actionLocked||game.dogs[di]===null)return;

    if(game.dogAction[di]){
      setMessage(`${E.DOGS[di].label} ${E.DOGS[di].name} はこのターン行動済みです。`);
      return;
    }

    if(game.selectedDog===di){
      game.selectedDog=null;
      setMessage("柴犬の選択を解除しました。");
      render();
      return;
    }

    game.selectedDog=di;
        setMessage(`${E.DOGS[di].label} ${E.DOGS[di].name} を選択。緑の交差点＝移動、青い箱＝探索です。`);
    render();
  }

  function performSearch(di,bi){
    // 探索開始時点で行動を確定し、演出中の二重行動を防ぐ。
    game.dogAction[di]="search";
    game.selectedDog=null;
    game.actionLocked=true;

    if(playMode==="cpuPolice"){
      game.cpuSearchedBoxes.add(bi);
      game.cpuSearchCount++;
      game.cpuSearchesThisTurn++;
    }

    render();

    A.animateSniff(board,game.dogs[di],di,bi,motionStatus,()=>{
      if(bi===game.catPos){
        Audio.play("capture");
        Audio.haptic([35,45,70]);
        A.burstAtBox(board,bi,"🐱✨");
        A.shakeBoxSoon(board,bi);
        game.actionLocked=false;
        endGame("dogs",`${E.DOGS[di].name} が箱${bi+1}をクンクン……ネコを発見！`);
        return;
      }

      if(game.catHistory.has(bi)){
        game.revealedTracks.set(bi,game.catHistory.get(bi));
        if(!cpuMemory.discoveredTrackBoxes.includes(bi)) cpuMemory.discoveredTrackBoxes.push(bi);

        const foundBox=board.querySelector(`.box[data-box-index="${bi}"]`);
        if(foundBox){
          foundBox.classList.remove("found-track");
          void foundBox.offsetWidth;
          foundBox.classList.add("found-track");
        }
        Audio.haptic([15,35,25]);
        A.shakeBoxSoon(board,bi);

        if(game.catHistory.get(bi)===1){
          Audio.play("start");
          A.burstAtBox(board,bi,"🚩✨");
          showToast("🚩","スタート地点を発見！","ここから逃げ始めたみたいだワン！");
        }else{
          Audio.play("paw");
          A.burstAtBox(board,bi,"🐾✨");
          showToast("🐕🐾","クンクン……！","ネコの足跡を発見！");
        }
      }else{
        if(playMode==="cpuPolice") cpuMemory.emptyBoxes.add(bi);
        const emptyBox=board.querySelector(`.box[data-box-index="${bi}"]`);
        if(emptyBox){
          emptyBox.classList.remove("empty-search");
          void emptyBox.offsetWidth;
          emptyBox.classList.add("empty-search");
        }
        Audio.play("empty");
        Audio.haptic(10);
        A.burstAtBox(board,bi,"💨");
        showToast("💨","クンクン……","何もないワン！");
      }

      game.actionLocked=false;
      setMessage(`${E.DOGS[di].label} ${E.DOGS[di].name} は探索済み✓。`);
      afterDogAction();
      render();
    });
  }

  function afterDogAction(){
    if(!E.allDogsDone(game))return;

    // CPU戦では waitingEnd に切り替えない。
    // 3匹目が「探索」だった場合、探索アニメーション終了後に
    // runCpuPoliceTurn() がもう一度呼ばれ、di === -1 を検知して
    // cpuFinishTurn() → ネコ側へ切り替える。
    //
    // ここで waitingEnd にしてしまうと runCpuPoliceTurn() 冒頭の
    // phase !== "dogs" 判定で処理が止まり、CPUターンが終了できない。
    if(playMode==="cpuPolice"){
      return;
    }

    game.phase="waitingEnd";
    setMessage("✅ 3匹の行動が完了しました。「柴犬ターン終了」を押してください。");
  }

  function toggleCatView(){
    if(game.phase!=="cat"||game.gameOver||game.actionLocked)return;
    game.catVisible=!game.catVisible;
    setMessage(game.catVisible
      ?"🐱 自分の足跡を表示中。グレー＝通過済み、緑＝移動可、赤⚠️＝行き止まり。"
      :"🙈 ネコの位置と足跡を隠しました。");
    render();
  }

  function finishDogTurn(){
    if(game.phase!=="waitingEnd"||game.gameOver||game.actionLocked)return;

    if(playMode==="cpuCat"){
      runCpuCatTurn();
      return;
    }

    if(game.turn>=E.MAX_TURNS){
      endGame("cat","11ターンすべて逃げ切りました！");
      return;
    }

    game.turn++;

    if(E.getCatLegalMoves(game).length===0){
      endGame("dogs","ネコが次に移動できる箱がありません！");
      return;
    }

    game.phase="cat";
    game.catVisible=false;
    game.selectedDog=null;
    game.dogAction=[false,false,false];

    let extra=game.turn===9?" あと3ターン！"
      :game.turn===10?" あと2ターン！"
      :game.turn===11?" LAST TURN！":"";

    showPrivacy("🐱",`ターン${game.turn}・ネコの番`,
      `柴犬警察から画面を受け取ってください。ネコさんだけ足跡と現在地を確認します。${extra}`);
    setMessage(`🐱 ターン${game.turn}。まだ通っていない隣の箱へ移動しよう。${extra}`);
    render();
  }

  function renderStatus(){
    const currentTurn=Math.max(0,Math.min(E.MAX_TURNS,game.turn));
    const remaining=game.turn===0 ? 11 : Math.max(0,E.MAX_TURNS-game.turn+1);
    turnDisplay.textContent=`${currentTurn} / ${E.MAX_TURNS}`;

    document.body.classList.remove("turn-mid","turn-late","turn-last");
    if(currentTurn>=8 && currentTurn<=9) document.body.classList.add("turn-mid");
    if(currentTurn===10) document.body.classList.add("turn-late");
    if(currentTurn===11) document.body.classList.add("turn-last");

    if(currentTurn===11 && !game.gameOver && !lastTurnStingerPlayed){
      lastTurnStingerPlayed=true;
      if(lastTurnBanner) lastTurnBanner.classList.remove("show");
      if(lastTurnBanner) void lastTurnBanner.offsetWidth;
      if(lastTurnBanner) lastTurnBanner.classList.add("show");
      Audio.play("lastturn");
      Audio.haptic([30,35,30]);
    }

    // BGM changes reliably for the final 3 escape turns.
    if(game.turn>0 && remaining<=3 && !game.gameOver){
      Audio.setBgmMode("tension");
      document.body.classList.add("final-three");
    }else{
      Audio.setBgmMode("normal");
      document.body.classList.remove("final-three");
    }

    const phases={
      dogSetup:"🐕 警察配置",
      catSetup:"🐱 ネコ潜伏",
      cat:"🐱 ネコ移動",
      dogs:"🐕 柴犬捜査",
      waitingEnd:"🐕 捜査完了",
      gameover:"🎉 ゲーム終了"
    };
    phaseDisplay.textContent=phases[game.phase]||"";

    document.body.classList.remove("phase-cat","phase-dogs","phase-setup","phase-cat-setup");
    if(game.phase==="cat"||game.phase==="catSetup") document.body.classList.add("phase-cat");
    else if(game.phase==="dogs"||game.phase==="waitingEnd") document.body.classList.add("phase-dogs");
    else document.body.classList.add("phase-setup");
    if(game.phase==="catSetup") document.body.classList.add("phase-cat-setup");

    if(lastRenderedPhase!==game.phase){
      if(game.phase==="catSetup") showPhaseCue("🐱","好きな箱に隠れよう！");
      else if(game.phase==="cat") showPhaseCue("🐱","ネコの逃走！");
      else if(game.phase==="dogs") showPhaseCue("🐕","柴犬警察の捜査！");
      lastRenderedPhase=game.phase;
    }

    if(game.actionLocked){
      guideDisplay.textContent=game.phase==="dogs"?"🐕 クンクン調査中…":"🐱 逃走中…";
    }else if(game.phase==="dogSetup"){
      guideDisplay.textContent=`0ターン目：中央16交差点に柴犬を配置 ${game.dogSetupCount}/3`;
    }else if(game.phase==="catSetup"){
      guideDisplay.textContent="逃走1ターン目：柴犬の配置を見てスタート地点を選ぼう";
    }else if(game.phase==="cat"){
      guideDisplay.textContent=game.catVisible
        ?"緑＝安全 / 赤⚠️＝危険 / グレー＝移動不可"
        :"「ネコ位置を見る」で現在地と逃げ道を確認";
    }else if(game.phase==="dogs"){
      guideDisplay.textContent=playMode==="cpuPolice"
        ?`CPU柴犬警察（${{easy:"やさしい",normal:"ふつう",hard:"つよい"}[cpuDifficulty]}）が捜査中…`
        :(game.selectedDog===null
          ?"柴犬を選択して、交差点へ移動 or 箱を探索"
          :"緑の交差点＝移動 / 青い箱＝探索");
    }else if(game.phase==="waitingEnd"){
      guideDisplay.textContent=playMode==="cpuPolice"?"CPUの捜査終了":"柴犬ターン終了をタップ";
    }else{
      guideDisplay.textContent="ゲーム終了";
    }
  }

  function renderDogCards(){
    for(let i=0;i<3;i++){
      const c=dogCards[i];
      c.classList.remove("selected","done");
      const pos=game.dogs[i];
      let status="未配置";

      if(pos!==null){
        if(game.dogAction[i]==="move"){
          status="移動済み ✓";
          c.classList.add("done");
        }else if(game.dogAction[i]==="search"){
          status=game.actionLocked?"探索中…":"探索済み ✓";
          c.classList.add("done");
        }else{
          status="行動できます";
        }
      }

      const dogImg=["dog_card_red.png","dog_card_green.png","dog_card_blue.png"][i];
      const role=playMode==="cpuPolice" ? ["探索に強い","バランス型","移動に強い"][i] : "";
      c.innerHTML=`<span class="dog-name"><img class="character-img" src="./assets/images/${dogImg}" alt="">${E.DOGS[i].name}</span>
        ${role?`<span class="dog-role">${role}</span>`:""}
        <span class="dog-status">${status}</span>`;
      if(game.selectedDog===i)c.classList.add("selected");

      c.disabled=!(
        (playMode==="local"||playMode==="cpuCat") &&
        game.phase==="dogs" &&
        pos!==null &&
        !game.dogAction[i] &&
        !game.actionLocked
      );
    }
  }

  function renderControls(){
    const isCatPhase=(game.phase==="cat"||game.phase==="catSetup");

    const shouldHideDogs=isCatPhase;
    const wasHidden=dogRow.classList.contains("is-hidden");
    dogRow.classList.toggle("is-hidden",shouldHideDogs);

    if(!shouldHideDogs && wasHidden){
      dogRow.classList.remove("phase-enter");
      void dogRow.offsetWidth;
      dogRow.classList.add("phase-enter");
    }

    tracksSummary.style.display=(game.phase==="dogSetup"||game.phase==="catSetup")?"none":"flex";
    tracksFoundCount.textContent=String(game.revealedTracks.size);

    catViewBtn.classList.toggle("show",game.phase==="cat");
    catViewBtn.disabled=game.phase!=="cat"||game.gameOver||game.actionLocked;
    catViewBtn.textContent=game.catVisible?"🙈 ネコ位置を隠す":"👀 ネコ位置を見る";

    finishDogTurnBtn.classList.toggle("show",(playMode==="local"||playMode==="cpuCat")&&game.phase==="waitingEnd");
    finishDogTurnBtn.disabled=game.phase!=="waitingEnd"||game.gameOver||game.actionLocked;
  }

  function showPhaseCue(icon,text){
    phaseCueIcon.textContent=icon;
    phaseCueText.textContent=text;
    phaseCue.classList.remove("show");
    void phaseCue.offsetWidth;
    phaseCue.classList.add("show");
  }

  function setMessage(t){message.textContent=t;}

  function showPrivacy(icon,title,text){
    privacyIcon.textContent=icon;
    privacyTitle.textContent=title;
    privacyText.textContent=text;
    privacyOverlay.classList.add("show");
  }

  function closePrivacy(){
    if(game.actionLocked)return;
    privacyOverlay.classList.remove("show");
  }

  function showToast(icon,title,text){
    clearTimeout(toastTimer);
    toastIcon.textContent=icon;
    toastTitle.textContent=title;
    toastText.textContent=text;
    toast.classList.add("show");
    toastTimer=setTimeout(hideToast,900);
  }

  function hideToast(){toast.classList.remove("show");}

  function updateSettingsUI(){
    sfxState.textContent=Audio.settings.sfx?"ON":"OFF";
    bgmState.textContent=Audio.settings.bgm?"ON":"OFF";
    vibrationState.textContent=Audio.settings.vibration?"ON":"OFF";

    sfxState.style.background=Audio.settings.sfx?"var(--green)":"#E6E2DE";
    bgmState.style.background=Audio.settings.bgm?"var(--green)":"#E6E2DE";
    vibrationState.style.background=Audio.settings.vibration?"var(--green)":"#E6E2DE";
    bgmVolumeSlider.value=String(Audio.settings.bgmVolume);
    bgmVolumeValue.textContent=`${Audio.settings.bgmVolume}%`;
  }

  function openSettings(){
    if(game.actionLocked)return;
    updateSettingsUI();
    settingsOverlay.classList.add("show");
      }

  function closeSettings(){settingsOverlay.classList.remove("show");}



  function boxDistance(a,b){
    return Math.abs(E.boxRow(a)-E.boxRow(b))+Math.abs(E.boxCol(a)-E.boxCol(b));
  }

  function nodeToBoxDistance(node,box){
    let best=99;
    E.getBoxesAroundNode(node).forEach(b=>{
      best=Math.min(best,boxDistance(b,box));
    });
    return best;
  }

  function isEdgeBox(b){
    const r=E.boxRow(b),c=E.boxCol(b);
    return r===0||r===4||c===0||c===4;
  }

  function catEscapeDegree(boxIndex){
    return E.getBoxNeighbors(boxIndex).filter(n=>!game.catHistory.has(n)).length;
  }

  function knownTrackBoxes(){
    return [...game.revealedTracks.keys()];
  }

  function inferredHotBoxes(){
    const tracks=knownTrackBoxes();
    const scores=new Map();

    if(!tracks.length){
      for(let b=0;b<E.BOX_COUNT;b++){
        let s=0;
        const r=E.boxRow(b),c=E.boxCol(b);
        s+=5-Math.abs(r-2)-Math.abs(c-2);
        if(!game.cpuSearchedBoxes.has(b)) s+=2.5;
        scores.set(b,s);
      }
      return scores;
    }

    for(let b=0;b<E.BOX_COUNT;b++){
      let s=0;
      let nearest=99;
      tracks.forEach(t=>nearest=Math.min(nearest,boxDistance(t,b)));
      s+=Math.max(0,7-nearest)*2.8;

      // The cat cannot return to its own path, so boxes around discovered tracks
      // but not already discovered become especially interesting.
      if(!game.revealedTracks.has(b)) s+=2.2;

      // Prefer escape corridors with multiple onward options.
      s+=catEscapeDegree(b)*1.25;

      if(game.cpuSearchedBoxes.has(b)) s-=5.5;
      if(cpuMemory.emptyBoxes.has(b)) s-=6.5;

      scores.set(b,s);
    }
    return scores;
  }

  function likelyEscapeBoxes(limit=6){
    const hot=inferredHotBoxes();
    return [...hot.entries()]
      .sort((a,b)=>b[1]-a[1])
      .slice(0,limit)
      .map(([b])=>b);
  }

  function dogRole(di){
    // Dynamic roles:
    // 0 tracker, 1 searcher, 2 blocker.
    // If one dog is much closer to tracks, it becomes tracker.
    const tracks=knownTrackBoxes();
    if(tracks.length){
      let bestDog=0,bestDist=99;
      for(let d=0;d<3;d++){
        const node=game.dogs[d];
        let dist=99;
        tracks.forEach(t=>dist=Math.min(dist,nodeToBoxDistance(node,t)));
        if(dist<bestDist){bestDist=dist;bestDog=d;}
      }
      if(di===bestDog) return "tracker";
    }
    return di===1 ? "searcher" : (di===2 ? "blocker" : "tracker");
  }

  function cpuProfile(){
    if(cpuDifficulty==="easy"){
      return {
        fresh:5.5, track:1.35, spread:.45, backtrack:3, role:1.5,
        endgame:1.5, noise:7.5, forceSearch:.72, think:260,
        targetSearches:1, searchBias:0
      };
    }
    if(cpuDifficulty==="hard"){
      return {
        fresh:13.5, track:5.2, spread:1.2, backtrack:12, role:6.2,
        endgame:8.5, noise:.45, forceSearch:1, think:520,
        targetSearches:2, searchBias:5.5
      };
    }
    return {
      fresh:11.8, track:4.0, spread:.78, backtrack:9.4, role:4.5,
      endgame:5.9, noise:1.05, forceSearch:1, think:390,
      targetSearches:2, searchBias:4.6
    };
  }

  function cpuThinkDelay(){
    return cpuProfile().think;
  }

  function scoreSearch(di,boxIndex){
    const role=dogRole(di);
    const hot=inferredHotBoxes();
    const profile=cpuProfile();

    let score=(hot.get(boxIndex)||0);

    // Always value fresh information.
    if(!game.cpuSearchedBoxes.has(boxIndex)) score+=profile.fresh;
    if(game.cpuSearchedBoxes.has(boxIndex)) score-=16;
    if(cpuMemory.emptyBoxes.has(boxIndex)) score-=18;

    // Evidence discovered here previously is useful, but do not obsess forever.
    if(game.revealedTracks.has(boxIndex)) score-=4;

    // Role tendencies.
    if(role==="searcher") score+=profile.role;
    if(role==="tracker" && knownTrackBoxes().length) score+=profile.role*.95;
    if(role==="blocker") score-=1.2;

    if(knownTrackBoxes().length){
      let nearest=99;
      knownTrackBoxes().forEach(t=>nearest=Math.min(nearest,boxDistance(t,boxIndex)));
      if(nearest===1) score+=6.5;
      else if(nearest===2) score+=3.5;
    }

    // Endgame: searching high-probability boxes matters more.
    const remaining=Math.max(0,E.MAX_TURNS-game.turn+1);
    if(remaining<=3) score+=profile.endgame;

    // Small randomness keeps behavior human.
    score+=Math.random()*profile.noise;

    return score;
  }

  function scoreMove(di,node){
    const role=dogRole(di);
    const profile=cpuProfile();
    let score=0;

    // Spread the dogs, but not too far.
    game.dogs.forEach((other,j)=>{
      if(j===di||other===null)return;
      const d=E.manhattanNodeDistance(node,other);
      if(d===0) score-=100;
      else if(d===1) score-=4;
      else score+=Math.min(d,4)*profile.spread;
    });

    // Avoid immediate backtracking.
    if(cpuMemory.lastDogNodes[di]===node) score-=profile.backtrack;

    // Move toward hot zones.
    const hot=likelyEscapeBoxes(8);
    let nearest=99;
    hot.forEach(b=>nearest=Math.min(nearest,nodeToBoxDistance(node,b)));
    score+=Math.max(0,7-nearest)*2.1;

    // Nodes overlooking multiple fresh boxes are valuable.
    const around=E.getBoxesAroundNode(node);
    const fresh=around.filter(b=>!game.cpuSearchedBoxes.has(b)).length;
    score+=fresh*1.35;
    if(fresh===0) score-=5.5;

    // Blocker values nodes adjacent to low-degree escape boxes.
    if(role==="blocker"){
      const choke=around.reduce((acc,b)=>{
        const deg=catEscapeDegree(b);
        return acc + (deg<=2 ? 2.2 : 0);
      },0);
      score+=choke;
    }

    // Tracker moves toward discovered tracks.
    if(role==="tracker" && knownTrackBoxes().length){
      let td=99;
      knownTrackBoxes().forEach(b=>td=Math.min(td,nodeToBoxDistance(node,b)));
      score+=Math.max(0,6-td)*profile.track;
    }

    // Slight central preference early.
    if(game.turn<=4){
      const r=E.nodeRow(node),c=E.nodeCol(node);
      score+=3-Math.abs(r-2.5)*.45-Math.abs(c-2.5)*.45;
    }

    // Endgame: prioritize blockade positions.
    const remaining=Math.max(0,E.MAX_TURNS-game.turn+1);
    if(remaining<=3){
      const likely=likelyEscapeBoxes(5);
      let block=0;
      likely.forEach(b=>{
        if(E.getBoxesAroundNode(node).includes(b)) block+=2.5;
      });
      score+=block;
    }

    score+=Math.random()*profile.noise;
    return score;
  }

  function hardProbabilityMap(){
    const probs=new Map();
    const tracks=knownTrackBoxes();

    for(let b=0;b<E.BOX_COUNT;b++){
      let p=1;

      if(game.cpuSearchedBoxes.has(b)) p*=0.08;
      if(cpuMemory.emptyBoxes.has(b)) p*=0.03;
      if(game.revealedTracks.has(b)) p*=0.25;

      if(tracks.length){
        let nearest=99;
        tracks.forEach(t=>nearest=Math.min(nearest,boxDistance(t,b)));
        if(nearest===1) p*=7.5;
        else if(nearest===2) p*=4.2;
        else if(nearest===3) p*=2.1;
        else p*=0.7;
      }else{
        const r=E.boxRow(b),c=E.boxCol(b);
        p*=1.2+(2.2-Math.abs(r-2)*.25-Math.abs(c-2)*.25);
      }

      p*=1+(catEscapeDegree(b)*.28);
      probs.set(b,p);
    }

    const total=[...probs.values()].reduce((a,b)=>a+b,0)||1;
    probs.forEach((v,k)=>probs.set(k,v/total));
    return probs;
  }

  function hardBestProbabilitySearch(di){
    const boxes=E.getBoxesAroundNode(game.dogs[di]);
    if(!boxes.length)return null;
    const probs=hardProbabilityMap();
    let best=null,bestScore=-Infinity;

    boxes.forEach(b=>{
      let s=(probs.get(b)||0)*160;
      if(!game.cpuSearchedBoxes.has(b)) s+=18;
      if(cpuMemory.emptyBoxes.has(b)) s-=25;
      if(s>bestScore){bestScore=s;best=b;}
    });

    return best===null?null:{type:"search",target:best,score:bestScore};
  }

  function hardBestContainmentMove(di){
    const moves=E.getDogLegalMoves(game,di);
    if(!moves.length)return null;
    const probs=hardProbabilityMap();
    let best=null,bestScore=-Infinity;

    moves.forEach(node=>{
      let score=0;
      const around=E.getBoxesAroundNode(node);

      around.forEach(b=>{
        const p=probs.get(b)||0;
        score+=p*120;
        if(catEscapeDegree(b)<=2) score+=p*55;
      });

      game.dogs.forEach((other,j)=>{
        if(j===di||other===null)return;
        const d=E.manhattanNodeDistance(node,other);
        if(d===0) score-=100;
        else if(d===1) score-=9;
        else score+=Math.min(d,4)*1.8;
      });

      if(cpuMemory.lastDogNodes[di]===node) score-=15;

      if(score>bestScore){bestScore=score;best=node;}
    });

    return best===null?null:{type:"move",target:best,score:bestScore};
  }

  function bestSearchAction(di){
    const node=game.dogs[di];
    const boxes=E.getBoxesAroundNode(node);

    let target=null,score=-Infinity;
    boxes.forEach(b=>{
      const s=scoreSearch(di,b);
      if(s>score){score=s;target=b;}
    });
    return {type:"search",target,score};
  }

  function bestMoveAction(di){
    const moves=E.getDogLegalMoves(game,di);

    let target=null,score=-Infinity;
    moves.forEach(n=>{
      const s=scoreMove(di,n);
      if(s>score){score=s;target=n;}
    });
    return {type:"move",target,score};
  }

  function chooseCpuAction(di){
    const profile=cpuProfile();
    let search=bestSearchAction(di);
    let move=bestMoveAction(di);
    const role=dogRole(di);
    const remaining=Math.max(0,E.MAX_TURNS-game.turn+1);

    if(cpuDifficulty==="hard"){
      const ps=hardBestProbabilitySearch(di);
      const cm=hardBestContainmentMove(di);
      if(ps && (!search || ps.score>search.score)) search=ps;
      if(cm && (!move || cm.score>move.score)) move=cm;
    }

    // Normal and Hard: aim for two searches every police turn.
    if(game.cpuSearchesThisTurn<profile.targetSearches && search && search.target!==null){
      if(!game.cpuSearchedBoxes.has(search.target)) return search;
    }

    if(knownTrackBoxes().length && search && search.target!==null){
      const evidenceBonus=cpuDifficulty==="hard" ? 8 : (cpuDifficulty==="normal" ? 6 : 2);
      if(!move || search.score+evidenceBonus>=move.score) return search;
    }

    if(role==="searcher" && search && search.target!==null && !game.cpuSearchedBoxes.has(search.target)){
      if(cpuDifficulty!=="easy") return search;
    }

    if(remaining<=3 && role==="blocker" && move && move.target!==null){
      const bonus=cpuDifficulty==="hard" ? 7 : (cpuDifficulty==="normal" ? 2.5 : 0);
      if(!search || move.score+bonus>=search.score+profile.searchBias) return move;
    }

    if(search && search.target!==null){
      if(!move || search.score+profile.searchBias>=move.score) return search;
    }

    if(cpuDifficulty==="easy" && Math.random()<0.2 && search && move){
      return Math.random()<.5 ? search : move;
    }

    if(move && move.target!==null) return move;
    return search && search.target!==null ? search : null;
  }

  function cpuThoughtFor(di,action){
    const role=dogRole(di);
    if(!action) return "うーん…";
    if(action.type==="search"){
      if(knownTrackBoxes().length) return role==="tracker" ? "足跡の先をクンクンするワン…" : "この辺りを重点捜査するワン…";
      return "未探索の箱を調べるワン…";
    }
    if(role==="blocker") return "逃げ道をふさぐワン…";
    if(knownTrackBoxes().length) return "足跡の先へ回り込むワン…";
    return "広く捜査するワン…";
  }

  function cpuSetupDogs(){
    const active=[];
    for(let i=0;i<E.NODE_COUNT;i++){
      if(E.isActiveDogNode(i)) active.push(i);
    }

    // Spread the dogs across the inner 4x4 grid.
    const preferred=[7,10,25,28].filter(E.isActiveDogNode);
    const chosen=[];

    while(chosen.length<3){
      let best=null,bestScore=-Infinity;

      active.forEach(n=>{
        if(chosen.includes(n)) return;

        let score=Math.random()*0.35;

        // Prefer distance from already chosen dogs.
        chosen.forEach(c=>{
          score+=E.manhattanNodeDistance(n,c)*1.6;
        });

        if(preferred.includes(n)) score+=1.2;

        if(score>bestScore){
          bestScore=score;
          best=n;
        }
      });

      chosen.push(best);
    }

    game.dogs=[chosen[0],chosen[1],chosen[2]];
    game.dogSetupCount=3;
  }

  function boxDistance(a,b){
    return Math.abs(E.boxRow(a)-E.boxRow(b))+Math.abs(E.boxCol(a)-E.boxCol(b));
  }

  function runCpuPoliceTurn(){
    if(playMode!=="cpuPolice" || game.gameOver || game.phase!=="dogs") return;

    // New turn begins before any dog has acted.
    if(game.dogAction.every(a=>a===false) && !game.actionLocked){
      game.cpuSearchesThisTurn=0;
    }

    let di=game.dogAction.findIndex(a=>a===false);

    if(di===-1){
      cpuFinishTurn();
      return;
    }

    let action=chooseCpuAction(di);

    if(cpuDifficulty!=="easy" && game.cpuSearchesThisTurn<cpuProfile().targetSearches){
      const remainingDogs=game.dogAction.filter(a=>a===false).length;
      const searchesNeeded=cpuProfile().targetSearches-game.cpuSearchesThisTurn;

      if(remainingDogs<=searchesNeeded){
        const forced=bestSearchAction(di);
        if(forced && forced.target!==null && !game.cpuSearchedBoxes.has(forced.target)){
          action=forced;
        }
      }
    }

    if(!action){
      game.dogAction[di]="move";
      cpuTimer=setTimeout(runCpuPoliceTurn,300);
      return;
    }

    game.actionLocked=true;
    const thought=cpuThoughtFor(di,action);
    guideDisplay.textContent=`🐕💭 ${E.DOGS[di]} ${thought}`;
    render();

    cpuTimer=setTimeout(()=>{
      if(game.gameOver) return;

      if(action.type==="move"){
        const previous=game.dogs[di];
        cpuMemory.lastDogNodes[di]=previous;

        game.dogs[di]=action.target;
        game.dogAction[di]="move";
        game.actionLocked=false;

        setMessage(`🤖 ${E.DOGS[di].name} が移動したワン！`);
        Audio.play("move");
        render();

        cpuTimer=setTimeout(runCpuPoliceTurn,430);

      }else{
        game.actionLocked=false;
        game.selectedDog=di;
        performSearch(di,action.target);

        const waitForSearch=()=>{
          if(game.gameOver) return;
          if(game.actionLocked){
            cpuTimer=setTimeout(waitForSearch,110);
            return;
          }
          cpuTimer=setTimeout(runCpuPoliceTurn,320);
        };
        cpuTimer=setTimeout(waitForSearch,160);
      }
    },cpuThinkDelay());
  }

  function cpuFinishTurn(){
    if(game.gameOver)return;

    game.phase="waitingEnd";
    const remaining=Math.max(0,E.MAX_TURNS-game.turn+1);
    setMessage(remaining<=3
      ?"🤖 CPU柴犬警察が包囲を強めています…"
      :"🤖 CPU柴犬警察の捜査が終了しました。");
    render();

    cpuTimer=setTimeout(()=>{
      if(game.turn>=E.MAX_TURNS){
        endGame("cat","11ターンすべて逃げ切りました！");
        return;
      }

      game.turn++;

      if(E.getCatLegalMoves(game).length===0){
        endGame("dogs","ネコが次に移動できる箱がありません！");
        return;
      }

      game.phase="cat";
      game.catVisible=false;
      game.selectedDog=null;
      game.dogAction=[false,false,false];
      game.cpuSearchesThisTurn=0;

      let extra=game.turn===9?" あと3ターン！"
        :game.turn===10?" あと2ターン！"
        :game.turn===11?" LAST TURN！":"";

      showPrivacy("🐱",`ターン${game.turn}・ネコの番`,
        `CPU柴犬警察の捜査が終わりました。ネコの位置を確認して次の箱へ移動してください。${extra}`);
      setMessage(`🐱 ターン${game.turn}。まだ通っていない隣の箱へ移動しよう。${extra}`);
      render();
    },650);
  }


  function showHowTo(){
    privacyIcon.textContent="📖";
    privacyTitle.textContent="遊び方";
    privacyText.textContent=
      "ネコは一度通った箱には戻れません。柴犬は1匹ずつ、移動か探索のどちらかを行います。11ターン逃げ切ればネコの勝ち、現在地を探索されるか逃げ道がなくなると柴犬警察の勝ちです。";
    privacyOverlay.classList.add("show");
  }

  function toggleQuickSound(){
    Audio.toggleSfx();
    Audio.toggleBgm();
    updateSettingsUI();
    soundQuickBtn.textContent=(Audio.settings.sfx||Audio.settings.bgm)?"🔊 サウンド":"🔇 サウンド";
  }


  function cpuCatDistanceFromDogs(boxIndex){
    let min=99;
    game.dogs.forEach(node=>{
      if(node===null)return;
      E.getBoxesAroundNode(node).forEach(b=>{
        min=Math.min(min,boxDistance(b,boxIndex));
      });
    });
    return min;
  }

  function cpuCatFutureFreedom(boxIndex){
    return E.getBoxNeighbors(boxIndex).filter(n=>!game.catHistory.has(n)).length;
  }


  function projectedDogPressure(boxIndex){
    // Estimate how many police intersections can pressure this box next turn.
    let pressure=0;
    game.dogs.forEach((node,di)=>{
      if(node===null)return;

      // current adjacency
      if(E.getBoxesAroundNode(node).includes(boxIndex)) pressure+=2.8;

      // one-move reach
      E.getDogLegalMoves(game,di).forEach(n=>{
        if(E.getBoxesAroundNode(n).includes(boxIndex)) pressure+=1.1;
      });
    });
    return pressure;
  }

  function cpuCatSecondStepValue(fromBox,nextBox){
    let best=-999;
    E.getBoxNeighbors(nextBox).forEach(n=>{
      if(game.catHistory.has(n) || n===fromBox) return;

      const dogDist=cpuCatDistanceFromDogs(n);
      const freedom=E.getBoxNeighbors(n).filter(x=>!game.catHistory.has(x) && x!==nextBox).length;
      const pressure=projectedDogPressure(n);

      let s=dogDist*4.2 + freedom*5.4 - pressure*4.8;
      if(freedom===0) s-=60;
      else if(freedom===1) s-=16;

      best=Math.max(best,s);
    });
    return best;
  }

  function cpuCatScore(boxIndex){
    const dogDist=cpuCatDistanceFromDogs(boxIndex);
    const freedom=cpuCatFutureFreedom(boxIndex);
    const pressure=projectedDogPressure(boxIndex);

    let score=0;

    if(cpuDifficulty==="easy"){
      score+=dogDist*1.6;
      score+=freedom*1.4;
      score-=pressure*.8;
      score+=Math.random()*8;
      if(freedom===0) score-=8;
      return score;
    }

    if(cpuDifficulty==="normal"){
      score+=dogDist*4.4;
      score+=freedom*5.2;
      score-=pressure*3.8;
      if(freedom===0) score-=40;
      if(freedom===1) score-=10;

      const lookahead=cpuCatSecondStepValue(game.catPos,boxIndex);
      if(lookahead>-999) score+=lookahead*.28;

      score+=Math.random()*1.5;
      return score;
    }

    // Hard: 2-step escape planning + police pressure avoidance.
    score+=dogDist*5.8;
    score+=freedom*6.2;
    score-=pressure*6.2;
    if(freedom===0) score-=95;
    if(freedom===1) score-=26;

    const lookahead=cpuCatSecondStepValue(game.catPos,boxIndex);
    if(lookahead>-999) score+=lookahead*.72;

    // Avoid getting squeezed toward an edge unless it is actually safe.
    if(isEdgeBox(boxIndex) && freedom<=2) score-=8;

    score+=Math.random()*.3;
    return score;
  }

  function cpuChooseStartBox(){
    let best=0,bestScore=-Infinity;

    for(let b=0;b<E.BOX_COUNT;b++){
      const dogDist=cpuCatDistanceFromDogs(b);
      const freedom=E.getBoxNeighbors(b).length;
      const pressure=projectedDogPressure(b);

      let s=dogDist*5 + freedom*2.3 - pressure*2.5;

      if(cpuDifficulty==="easy"){
        s+=Math.random()*14;
      }else if(cpuDifficulty==="normal"){
        s+=freedom*2.2;
        s+=Math.random()*2.2;
      }else{
        // Hard prefers starts with both distance and multiple exits.
        s+=freedom*4.4;
        if(freedom<=2)s-=10;
        s+=Math.random()*.35;
      }

      if(s>bestScore){bestScore=s;best=b;}
    }

    return best;
  }

  function cpuChooseCatMove(){
    const moves=E.getCatLegalMoves(game);
    if(!moves.length)return null;

    let best=moves[0],bestScore=-Infinity;
    moves.forEach(b=>{
      const s=cpuCatScore(b);
      if(s>bestScore){bestScore=s;best=b;}
    });
    return best;
  }

  function cpuCatInitialHide(){
    if(playMode!=="cpuCat"||game.gameOver)return;

    // 警察側にはネコの潜伏位置を絶対に見せない。
    game.actionLocked=true;
    game.catVisible=false;
    document.body.classList.add("cpu-cat-thinking");
    guideDisplay.textContent="🐱💭 CPUネコが隠れています…";

    cpuTimer=setTimeout(()=>{
      const start=cpuChooseStartBox();

      // 内部状態だけ更新。盤面上では一切表示・演出しない。
      game.catPos=start;
      game.catHistory.clear();
      game.catHistory.set(start,1);
      cpuCatRoute=[{box:start,turn:1}];
      game.catVisible=false;

      game.turn=1;
      game.phase="dogs";
      game.selectedDog=null;
      game.dogAction=[false,false,false];
      game.actionLocked=false;
      document.body.classList.remove("cpu-cat-thinking");

      showPhaseCue("🐕","捜査開始！");
      setMessage("🐕 CPUネコが隠れました。柴犬を選んで捜査しよう。");
      render();
    },cpuDifficulty==="hard"?650:420);
  }

  function runCpuCatTurn(){
    if(playMode!=="cpuCat"||game.gameOver)return;

    if(game.turn>=E.MAX_TURNS){
      endGame("cat","11ターンすべて逃げ切りました！");
      return;
    }

    game.turn++;
    game.phase="cat";
    game.catVisible=false;
    game.actionLocked=true;
    document.body.classList.add("cpu-cat-thinking");
    guideDisplay.textContent="🐱💭 CPUネコがこっそり移動中…";
    render();

    cpuTimer=setTimeout(()=>{
      const target=cpuChooseCatMove();

      if(target===null){
        game.actionLocked=false;
        document.body.classList.remove("cpu-cat-thinking");
        endGame("dogs","CPUネコの逃げ道がなくなりました！");
        return;
      }

      // 警察側では移動アニメーションを出さず、内部位置だけ更新する。
      // これにより現在地・移動方向が漏れない。
      game.catPos=target;
      game.catHistory.set(target,game.turn);
      cpuCatRoute.push({box:target,turn:game.turn});
      game.catVisible=false;
      game.phase="dogs";
      game.selectedDog=null;
      game.dogAction=[false,false,false];
      game.actionLocked=false;
      document.body.classList.remove("cpu-cat-thinking");

      if(E.getCatLegalMoves(game).length===0 && game.turn<E.MAX_TURNS){
        endGame("dogs","CPUネコの次の逃げ道がなくなりました！");
        return;
      }

            showPhaseCue("🐕","柴犬警察の捜査！");
      setMessage("🐕 CPUネコが移動しました。柴犬3匹を行動させよう。");
      render();
    },cpuDifficulty==="hard"?720:(cpuDifficulty==="normal"?520:340));
  }


  function clearRouteReveal(){
    board.querySelectorAll(".route-step,.route-line").forEach(el=>el.remove());
  }

  function boxCenterPercent(boxIndex){
    const r=E.boxRow(boxIndex),c=E.boxCol(boxIndex);
    // Board layout is a 5x5 box grid with intersections between boxes.
    // These percentages match the box centers visually.
    return {
      x:10 + c*20,
      y:12 + r*20
    };
  }


  function renderResultCpuCatRoute(){

    const ordered=cpuCatRoute.length
      ? cpuCatRoute.slice().sort((a,b)=>a.turn-b.turn)
      : [...game.catHistory.entries()]
          .sort((a,b)=>a[1]-b[1])
          .map(([box,turn])=>({box,turn}));

    if(!ordered.length)return;

    if(resultRouteBoard) if(resultRouteBoard) resultRouteBoard.innerHTML="";

    // Draw all 25 cardboard cells.
    for(let b=0;b<E.BOX_COUNT;b++){
      const r=E.boxRow(b),c=E.boxCol(b);
      const cell=document.createElement("div");
      cell.className="result-route-cell";
      cell.style.left=`${10+c*20}%`;
      cell.style.top=`${10+r*20}%`;
      cell.textContent=b+1;
      if(resultRouteBoard) resultRouteBoard.appendChild(cell);
    }

    // SVG route line.
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 100 100");
    svg.setAttribute("preserveAspectRatio","none");
    svg.classList.add("result-route-svg");

    const polyline=document.createElementNS("http://www.w3.org/2000/svg","polyline");
    const points=ordered.map(step=>{
      const r=E.boxRow(step.box),c=E.boxCol(step.box);
      return `${10+c*20},${10+r*20}`;
    }).join(" ");
    polyline.setAttribute("points",points);
    svg.appendChild(polyline);
    if(resultRouteBoard) resultRouteBoard.appendChild(svg);

    ordered.forEach((step,idx)=>{
      const r=E.boxRow(step.box),c=E.boxCol(step.box);
      const badge=document.createElement("div");
      badge.className="result-route-badge";
      if(idx===0)badge.classList.add("start");
      if(idx===ordered.length-1)badge.classList.add("final");
      badge.style.left=`${10+c*20}%`;
      badge.style.top=`${10+r*20}%`;
      badge.textContent=idx===0?"S":String(step.turn);
      if(resultRouteBoard) resultRouteBoard.appendChild(badge);
    });

    if(resultRouteNote) resultRouteNote.textContent=`STARTから最終地点まで ${ordered.length}地点`;
    if(resultRoute) resultRoute.classList.add("show");
  }

  function revealCpuCatRoute(){

    clearRouteReveal();

    const ordered=cpuCatRoute.length
      ? cpuCatRoute.slice().sort((a,b)=>a.turn-b.turn)
      : [...game.catHistory.entries()]
          .sort((a,b)=>a[1]-b[1])
          .map(([box,turn])=>({box,turn}));

    if(!ordered.length)return;

    // Force a fresh board render so the route badges have correct anchors.
    renderBoard();

    const boardRect=board.getBoundingClientRect();

    const centerForBox=(boxIndex)=>{
      const el=board.querySelector(`.box[data-box-index="${boxIndex}"]`);
      if(!el)return boxCenterPercent(boxIndex);

      const r=el.getBoundingClientRect();
      return {
        x:((r.left+r.width/2-boardRect.left)/boardRect.width)*100,
        y:((r.top+r.height/2-boardRect.top)/boardRect.height)*100
      };
    };

    ordered.forEach((step,idx)=>{
      if(idx<ordered.length-1){
        const a=centerForBox(step.box);
        const b=centerForBox(ordered[idx+1].box);
        const dx=b.x-a.x,dy=b.y-a.y;
        const length=Math.sqrt(dx*dx+dy*dy);
        const angle=Math.atan2(dy,dx)*180/Math.PI;

        const line=document.createElement("div");
        line.className="route-line";
        line.style.left=`${a.x}%`;
        line.style.top=`${a.y}%`;
        line.style.width=`${length}%`;
        line.style.transform=`rotate(${angle}deg)`;
        board.appendChild(line);
      }
    });

    ordered.forEach((step,idx)=>{
      const p=centerForBox(step.box);
      const badge=document.createElement("div");
      badge.className="route-step";
      if(idx===0)badge.classList.add("start");
      if(idx===ordered.length-1)badge.classList.add("final");

      badge.style.left=`${p.x}%`;
      badge.style.top=`${p.y}%`;
      badge.textContent=idx===0?"START":String(step.turn);
      board.appendChild(badge);
    });

    if(routeRevealSub) routeRevealSub.textContent=`${ordered.length}地点を通過`;
    if(routeRevealPanel) routeRevealPanel.classList.add("show");

    guideDisplay.textContent="🐾 ネコの逃走ルートを公開しました";
  }

  function showResultAfterCutin(){
    if(!resultOverlay)return;

    resultOverlay.classList.add("show");
    resultOverlay.classList.add("resultOverlayCelebration");
    A.confetti(confettiLayer);
    setTimeout(()=>resultOverlay.classList.remove("resultOverlayCelebration"),700);

    // Connect Phase5 cut-in directly to the existing escape-route result.
    renderResultCpuCatRoute();
    setTimeout(revealCpuCatRoute,160);
  }

  function showVictoryCutin(winner){
    if(!victoryCutin || !victoryCutinImage){
      showResultAfterCutin();
      return;
    }

    clearTimeout(victoryCutinTimer);
    victoryCutin.classList.remove("closing");
    victoryCutinImage.src=winner==="cat"
      ? "./assets/images/cutin_cat_win.jpg"
      : "./assets/images/cutin_police_win.jpg";
    victoryCutinImage.alt=winner==="cat"
      ? "いたずらネコ勝利カットイン"
      : "柴犬警察勝利カットイン";

    victoryCutin.classList.add("show");
    victoryCutin.setAttribute("aria-hidden","false");

    let finished=false;
    const finish=()=>{
      if(finished)return;
      finished=true;
      clearTimeout(victoryCutinTimer);
      victoryCutin.classList.add("closing");
      setTimeout(()=>{
        victoryCutin.classList.remove("show","closing");
        victoryCutin.setAttribute("aria-hidden","true");
        showResultAfterCutin();
      },240);
    };

    victoryCutin.onclick=finish;
    victoryCutinTimer=setTimeout(finish,1850);
  }

  function endGame(winner,reason){
    game.gameOver=true;
    if(resultRoute) resultRoute.classList.remove("show");
    if(resultRouteBoard) if(resultRouteBoard) resultRouteBoard.innerHTML="";
    if(resultRouteNote) resultRouteNote.textContent="";

    const resultModalEl=resultOverlay.querySelector(".modal");
    if(resultModalEl){
      resultModalEl.classList.remove("win-cat","win-dogs","celebrate");
      resultModalEl.classList.add(winner==="cat"?"win-cat":"win-dogs","celebrate");
    }
    game.phase="gameover";
    game.catVisible=true;
    game.selectedDog=null;
    game.actionLocked=false;

    if(winner==="dogs"){
      resultIcon.textContent="🐕🐕🐕✨";
      resultTitle.textContent="柴犬警察の勝利！";
      resultText.textContent=`${reason} ネコの最後の場所は箱${game.catPos+1}でした。`;
    }else{
      resultIcon.textContent="🐱🎀✨";
      resultTitle.textContent="いたずらネコの勝利！";
      resultText.textContent=`${reason} 最後は箱${game.catPos+1}に隠れていました。`;
    }

    // Freeze the final board first, then play the dedicated Phase5 cut-in.
    resultOverlay.classList.remove("show");
    Audio.stopBgm();
    Audio.play(winner==="cat"?"catwin":"policewin");
    Audio.haptic([40,50,40,50,90]);
    render();

    // Short beat before the cut-in makes the win moment feel intentional.
    victoryCutinTimer=setTimeout(()=>showVictoryCutin(winner),280);
  }

  bindPress(onlineModeBtn,openOnlineMode);
  bindPress(onlineCloseBtn,closeOnlineMode);
  bindPress(onlineCreateRoomBtn,createOnlineRoom);
  bindPress(onlineCopyCodeBtn,copyOnlineCode);
  bindPress(onlineCancelRoomBtn,closeOnlineMode);
  bindPress(localModeBtn,startLocalMode);
  bindPress(cpuModeBtn,startCpuPoliceMode);
  bindPress(playCatSideBtn,()=>chooseCpuSide("cat"));
  bindPress(playPoliceSideBtn,()=>chooseCpuSide("police"));
  bindPress(cpuSideBackBtn,closeCpuSidePicker);
  bindPress(cpuEasyBtn,()=>beginCpuPoliceGame("easy"));
  bindPress(cpuNormalBtn,()=>beginCpuPoliceGame("normal"));
  bindPress(cpuHardBtn,()=>beginCpuPoliceGame("hard"));
  bindPress(difficultyBackBtn,closeDifficultyPicker);
  bindPress(titleSettingsBtn,openSettings);
  bindPress(howToBtn,showHowTo);
  bindPress(soundQuickBtn,toggleQuickSound);

  for(let i=0;i<3;i++) bindPress(dogCards[i],()=>selectDog(i));
  bindPress(catViewBtn,toggleCatView);
  bindPress(settingsBtn,openSettings);
  bindPress(settingsCloseBtn,closeSettings);
  bindPress(restartFromSettingsBtn,()=>{
    settingsOverlay.classList.remove("show");
    initGame(false);
    if(playMode==="local"){
      showPrivacy("🐕","0ターン目・警察配置",
        "まず柴犬警察3匹を中央16交差点に配置してください。配置後にネコがスタート地点を選びます。");
    }else if(playMode==="cpuPolice"){
      cpuSetupDogs();
      game.phase="catSetup";
      game.turn=1;
      showPrivacy("🐱","逃走1ターン目・ネコの番",
        "CPU柴犬警察の配置を確認して、スタート地点にする箱を選んでください。");
    }else{
      game.phase="dogSetup";
      game.turn=0;
      showPrivacy("🐕","0ターン目・警察配置",
        "CPUネコと再戦します。柴犬警察3匹を配置してください。");
    }
    render();


  });
  bindPress(backToTitleBtn,()=>{
    settingsOverlay.classList.remove("show");
    initGame(true);
  });
  bindPress(sfxToggleBtn,()=>{Audio.toggleSfx();updateSettingsUI();});
  bindPress(bgmToggleBtn,()=>{Audio.toggleBgm();updateSettingsUI();});
  bgmVolumeSlider.addEventListener("input",()=>{
    const v=Audio.setBgmVolume(bgmVolumeSlider.value);
    bgmVolumeValue.textContent=`${v}%`;
    Audio.startBgm();
  });
  bindPress(vibrationToggleBtn,()=>{Audio.toggleVibration();updateSettingsUI();});
  bindPress(finishDogTurnBtn,finishDogTurn);
  bindPress(privacyBtn,closePrivacy);
  bindPress(againBtn,()=>{
    Audio.setBgmMode("normal");
    Audio.startBgm();
    Audio.play("gamestart");
    initGame(false);
  });

  initGame(true);
})();
