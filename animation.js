/* にゃんチェイス - アニメーション */
window.NyanAnimation = (() => {
  function centerOfBox(board,i){
    const el=board.querySelector(`[data-box-index="${i}"]`);
    if(!el) return null;
    const r=el.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,el};
  }

  function centerOfNode(board,i){
    const nodes=[...board.querySelectorAll(".node")];
    const el=nodes[i];
    if(!el) return null;
    const r=el.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,el};
  }

  function tapPopBox(board,i){
    const p=centerOfBox(board,i);
    if(!p) return;
    p.el.classList.remove("tap-pop");
    void p.el.offsetWidth;
    p.el.classList.add("tap-pop");
    setTimeout(()=>p.el.classList.remove("tap-pop"),260);
  }

  function animateBoxOpen(board,i){
    NyanAudio.play("box");
    const p=centerOfBox(board,i);
    if(!p) return;
    p.el.classList.remove("opening");
    void p.el.offsetWidth;
    p.el.classList.add("opening");
    setTimeout(()=>p.el.classList.remove("opening"),470);
  }

  function burstAtBox(board,i,emoji="✨"){
    const p=centerOfBox(board,i);
    if(!p) return;
    const e=document.createElement("div");
    e.className="fx-burst";
    e.textContent=emoji;
    e.style.left=p.x+"px";
    e.style.top=p.y+"px";
    document.body.appendChild(e);
    setTimeout(()=>e.remove(),760);
  }

  function animateCatMove(board,from,to,done){
    const a=centerOfBox(board,from), b=centerOfBox(board,to);
    if(!a||!b){ if(done)done(); return; }
    const e=document.createElement("div");
    e.className="cat-fly";
    e.textContent="🐱";
    e.style.left=a.x+"px";
    e.style.top=a.y+"px";
    document.body.appendChild(e);
    requestAnimationFrame(()=>{
      e.classList.add("go");
      e.style.left=b.x+"px";
      e.style.top=b.y+"px";
    });
    setTimeout(()=>{
      burstAtBox(board,to,"💨");
      e.style.opacity="0";
      setTimeout(()=>{e.remove();if(done)done();},120);
    },380);
  }

  function animateSniff(board,nodeIndex,di,bi,motionStatus,done){
    // Phase4.2: the stray `Nyan` identifier caused a ReferenceError here,
    // leaving game.actionLocked=true and making search look frozen.
    NyanAudio.play("search");
    const n=centerOfNode(board,nodeIndex);
    if(!n){ if(done)done(); return; }

    const e=document.createElement("div");
    e.className="dog-sniff";
    e.textContent=`🐕${di+1}`;
    e.style.filter="drop-shadow(0 4px 4px rgba(93,64,55,.18))";
    e.style.left=n.x+"px";
    e.style.top=n.y+"px";
    document.body.appendChild(e);

    if(motionStatus){
      motionStatus.textContent="クンクン……";
      motionStatus.classList.add("show");
      setTimeout(()=>motionStatus.classList.remove("show"),750);
    }

    NyanAudio.haptic(18);
    setTimeout(()=>animateBoxOpen(board,bi),320);

    setTimeout(()=>{
      burstAtBox(board,bi,"✨");
      e.remove();
      if(done)done();
    },820);
  }

  function shakeBoxSoon(board,i){
    setTimeout(()=>{
      const e=board.querySelector(`[data-box-index="${i}"]`);
      if(!e)return;
      e.classList.add("shake");
      setTimeout(()=>e.classList.remove("shake"),600);
    },35);
  }

  function confetti(layer){
    if(!layer) return;
    layer.innerHTML="";
    const pieces=["🎉","✨","🌟","🎊","💖","🐾"];
    for(let i=0;i<34;i++){
      const e=document.createElement("span");
      e.className="confetti-piece";
      e.textContent=pieces[Math.floor(Math.random()*pieces.length)];
      e.style.left=Math.random()*100+"vw";
      e.style.setProperty("--dur",(1.8+Math.random()*1.7)+"s");
      e.style.setProperty("--drift",(-80+Math.random()*160)+"px");
      e.style.animationDelay=(Math.random()*.45)+"s";
      layer.appendChild(e);
    }
    setTimeout(()=>layer.innerHTML="",3600);
  }

  return {
    centerOfBox,centerOfNode,tapPopBox,animateBoxOpen,burstAtBox,
    animateCatMove,animateSniff,shakeBoxSoon,confetti
  };
})();
