(function(){

function ready(fn){
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",fn);
  } else { fn(); }
}

function getName(){
  const ids = ["studentIdentity","teacherIdentity","studentName"];
  for(const id of ids){
    const el = document.getElementById(id);
    if(!el) continue;
    const t = (el.textContent||"").trim();
    if(t && t.toLowerCase()!=="student" && t.toLowerCase()!=="teacher"){
      return t;
    }
  }
  return "";
}

function getMenuType(){
  const brand = document.querySelector(".brand p");
  return brand ? brand.textContent.trim() : "Menu";
}

ready(()=>{

  const sidebar = document.getElementById("sidebar");
  const btn = document.getElementById("menuToggle");

  if(!sidebar || !btn) return;

  let header = document.getElementById("menuHeaderFloating");

  if(!header){
    header = document.createElement("div");
    header.id = "menuHeaderFloating";
    header.className = "menu-header-floating";

    header.innerHTML = `
  "<div class=""menu-header-line1"">☰ YouTeach</div>" +
  "<div class=""menu-header-line2""></div>" +
  "<div class=""menu-header-line3""></div>";

    document.body.appendChild(header);
  }

  function updateHeader(){
    header.querySelector(".menu-header-line2").textContent = getMenuType();
    header.querySelector(".menu-header-line3").textContent = getName();
  }

  function openMenu(){
    sidebar.classList.add("sidebar-open");
    updateHeader();
    header.classList.add("show");
  }

  function closeMenu(){
    sidebar.classList.remove("sidebar-open");
    header.classList.remove("show");
  }

  btn.addEventListener("click",(e)=>{
    e.preventDefault();
    e.stopPropagation();

    if(sidebar.classList.contains("sidebar-open")){
      closeMenu();
    } else {
      openMenu();
    }
  });

  document.addEventListener("click",(e)=>{
    if(!sidebar.contains(e.target) && !btn.contains(e.target)){
      closeMenu();
    }
  });

  document.addEventListener("keydown",(e)=>{
    if(e.key==="Escape"){
      closeMenu();
    }
  });

});

})();