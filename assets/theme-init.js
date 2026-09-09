(function(){
  'use strict';
  try{
    const saved=localStorage.getItem('theme');
    document.documentElement.dataset.theme=saved==='dark'?'dark':'light';
  }catch(_){
    document.documentElement.dataset.theme='light';
  }
})();
