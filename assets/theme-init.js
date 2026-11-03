(function(){
  'use strict';
  try{
    // Start the accepted light visual system once; later explicit dark choices survive.
    if(/(?:teacher-login|student|parent)\.html$/.test(location.pathname)&&localStorage.getItem('tm-visual-theme-version')!=='5.4'){
      localStorage.setItem('theme','light');localStorage.setItem('tm-visual-theme-version','5.4');
    }
    const saved=localStorage.getItem('theme');
    document.documentElement.dataset.theme=saved==='dark'?'dark':'light';
  }catch(_){
    document.documentElement.dataset.theme='light';
  }
})();
