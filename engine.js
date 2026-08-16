/* にゃんチェイス - ルールエンジン
   UIやアニメーションに依存しないルール処理だけを置く。
*/
window.NyanEngine = (() => {
  const BOX_ROWS = 5;
  const BOX_COLS = 5;
  const NODE_ROWS = 6;
  const NODE_COLS = 6;
  const BOX_COUNT = 25;
  const NODE_COUNT = 36;
  const MAX_TURNS = 11;

  const DOGS = [
    {name:"あか柴", label:"🟥", token:"dog-red"},
    {name:"あお柴", label:"🟦", token:"dog-blue"},
    {name:"しろ柴", label:"🟨", token:"dog-cream"}
  ];

  function createState(){
    return {
      turn:0,
      phase:"dogSetup",
      catPos:null,
      catVisible:false,
      catHistory:new Map(),
      revealedTracks:new Map(),
      dogs:[null,null,null],
      dogSetupCount:0,
      selectedDog:null,
      dogAction:[false,false,false],
      actionLocked:false,
      cpuSearchedBoxes:new Set(),
      cpuSearchCount:0,
      cpuSearchesThisTurn:0,
      gameOver:false
    };
  }

  const boxRow = i => Math.floor(i / BOX_COLS);
  const boxCol = i => i % BOX_COLS;
  const nodeRow = i => Math.floor(i / NODE_COLS);
  const nodeCol = i => i % NODE_COLS;

  function isActiveDogNode(i){
    const r=nodeRow(i), c=nodeCol(i);
    return r>=1 && r<=4 && c>=1 && c<=4;
  }

  function getBoxNeighbors(i){
    const r=boxRow(i), c=boxCol(i), a=[];
    if(r>0) a.push(i-BOX_COLS);
    if(r<BOX_ROWS-1) a.push(i+BOX_COLS);
    if(c>0) a.push(i-1);
    if(c<BOX_COLS-1) a.push(i+1);
    return a;
  }

  function getCatLegalMoves(state){
    if(state.catPos===null) return [];
    return getBoxNeighbors(state.catPos).filter(i => !state.catHistory.has(i));
  }

  // A red move is one that cannot possibly complete the remaining route
  // through turn 11 without revisiting a box.  This is stronger than the old
  // "next turn has no exit" check and catches traps several turns in advance.
  function canCatFinishFrom(state,target){
    if(!getCatLegalMoves(state).includes(target)) return false;

    // target is the box chosen for the current turn.  After entering it, the
    // cat still needs one new box for each later turn through MAX_TURNS.
    const movesNeeded=Math.max(0,MAX_TURNS-state.turn);
    if(movesNeeded===0) return true;

    const blocked=new Set(state.catHistory.keys());
    blocked.add(target);

    function dfs(pos,stepsLeft){
      if(stepsLeft===0) return true;
      for(const next of getBoxNeighbors(pos)){
        if(blocked.has(next)) continue;
        blocked.add(next);
        if(dfs(next,stepsLeft-1)) return true;
        blocked.delete(next);
      }
      return false;
    }
    return dfs(target,movesNeeded);
  }

  function isCatDeadEnd(state,target){
    // 非合法マスは危険判定の対象外。
    // これを入れないと、移動できない全マスが⚠️扱いになってしまう。
    if(!getCatLegalMoves(state).includes(target)) return false;
    return !canCatFinishFrom(state,target);
  }

  function getNodeNeighbors(i){
    const r=nodeRow(i), c=nodeCol(i), a=[];
    if(r>0) a.push(i-NODE_COLS);
    if(r<NODE_ROWS-1) a.push(i+NODE_COLS);
    if(c>0) a.push(i-1);
    if(c<NODE_COLS-1) a.push(i+1);
    return a;
  }

  function getDogLegalMoves(state,di){
    const cur=state.dogs[di];
    if(cur===null) return [];
    return getNodeNeighbors(cur)
      .filter(isActiveDogNode)
      .filter(t => !state.dogs.some((p,j) => j!==di && p===t));
  }

  function getBoxesAroundNode(i){
    const r=nodeRow(i), c=nodeCol(i), out=[];
    [[r-1,c-1],[r-1,c],[r,c-1],[r,c]].forEach(([br,bc])=>{
      if(br>=0 && br<BOX_ROWS && bc>=0 && bc<BOX_COLS){
        out.push(br*BOX_COLS+bc);
      }
    });
    return out;
  }

  function allDogsDone(state){
    return state.dogAction.every(a => a!==false);
  }

  function manhattanNodeDistance(a,b){
    return Math.abs(nodeRow(a)-nodeRow(b))+Math.abs(nodeCol(a)-nodeCol(b));
  }

  function boxesAroundDogs(state){
    const set=new Set();
    state.dogs.forEach(node=>{
      if(node!==null){
        getBoxesAroundNode(node).forEach(b=>set.add(b));
      }
    });
    return [...set];
  }

  return {
    BOX_ROWS, BOX_COLS, NODE_ROWS, NODE_COLS,
    BOX_COUNT, NODE_COUNT, MAX_TURNS, DOGS,
    createState, boxRow, boxCol, nodeRow, nodeCol,
    isActiveDogNode, getBoxNeighbors, getCatLegalMoves,
    canCatFinishFrom, isCatDeadEnd, getNodeNeighbors, getDogLegalMoves,
    getBoxesAroundNode, allDogsDone,
    manhattanNodeDistance, boxesAroundDogs
  };
})();
