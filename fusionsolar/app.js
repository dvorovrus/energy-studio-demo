(function() {
  'use strict';
  const engine=window.EnergyModel, bms=window.JKBms;
  if (!engine || !bms) throw Error('Missing model modules');
  const $=id=>document.getElementById(id);
  const animatedReadouts=new Set(['hero-soc','scene-soc','metric-soc','ring-soc','metric-power','metric-voltage','map-battery','map-solar','map-home','map-grid','scene-solar','scene-home','scene-grid']);
  const motionOff=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  const setText=(id,value)=>{
    const el=$(id);if(!el)return;
    const next=String(value);
    if(el.textContent===next)return;
    el.textContent=next;
    if(animatedReadouts.has(id)&&!motionOff()){
      el.classList.remove('motion-enter');
      void el.offsetWidth;
      el.classList.add('motion-enter');
    }
  };
  const state={
    mode:'demo', status:'demo', tokenConfigured:false, last:null,
    demo:{soc:82,voltage:26.2,current:-11.45,solarW:0,homeW:300},
    period:'day', session:[], lastSample:null, lastPoll:0,
    polling:false, timer:null, theme:'light'  };
  const presets={
    battery:{soc:82,current:-11.45,solarW:0,homeW:300},
    grid:{soc:82,current:0,solarW:0,homeW:300},
    sun:{soc:82,current:18,solarW:1800,homeW:500},
    idle:{soc:99,current:0,solarW:0,homeW:0}
  };
  const svgNS='http://www.w3.org/2000/svg';
  const svg=(type,attrs)=>{const node=document.createElementNS(svgNS,type);
    Object.entries(attrs||{}).forEach(([k,v])=>node.setAttribute(k,String(v)));return node;};
  const fmt=engine.formatPower;
  const signedPower=n=>n===null?'—':(n < -1?'−':n > 1?'+':'')+fmt(n);
  const currentFormat=n=>Number(n).toFixed(2)+' А';
  const pct=n=>Math.round(n)+'%';
  const toSeconds=()=>Math.floor(Date.now()/1000);
  const withTimeout=async(url,options={})=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),4000);
    try {
      return await fetch(url,{credentials:'same-origin',cache:'no-store',mode:'same-origin',...options,signal:controller.signal});
    } finally {clearTimeout(timeout);}
  };
  const bridgeUrl=name=>'./bridge/'+name;
  async function bridgeRequest(name, options) {
    const response=await withTimeout(bridgeUrl(name),options);
    let data={};
    try {data=await response.json();}catch(_){}
    if (!response.ok) {
      const err=new Error(typeof data.error==='string'?data.error:'bridge_unavailable');
      err.code=response.status;throw err;
    }
    return data;
  }
  function statusMessage(message,kind='neutral') {
    setText('source-status',message);
    const node=$('source-status');if(node)node.dataset.level=kind;
  }
  function connectionMessage(message,kind='neutral') {
    setText('connection-result',message);
    $('connection-result').dataset.level=kind;
  }
  const plot=(values,width,height,pad)=>{
    if(!Array.isArray(values)||values.length<2)return '';
    const valid=values.filter(Number.isFinite);
    if(valid.length!==values.length)return '';
    const min=Math.min(...values),max=Math.max(...values),gap=Math.max(1,max-min);
    return values.map((v,i)=>(i?'L':'M')+
      (pad+i*(width-2*pad)/(values.length-1)).toFixed(2)+','+
      (height-pad-(v-min)/gap*(height-2*pad)).toFixed(2)).join(' ');
  };
  const demoSeries=(kind,n,phase)=>{
    const source=state.demo;
    return Array.from({length:n},(_,i)=>{
      const t=i/Math.max(1,n-1);
      if(kind==='soc')return Math.max(0,Math.min(100,source.soc-18+18*t+3*Math.sin(t*11)));
      if(kind==='solar')return Math.max(0,Math.sin(Math.PI*t)*(900+250*Math.sin(5*t+phase))+40*Math.cos(t*13));
      if(kind==='grid')return Math.max(0,600+190*Math.sin(t*13+phase)+100*Math.cos(t*17));
      return Math.max(0,source.homeW*0.7+130*Math.cos(t*9+phase)+140*Math.pow(Math.sin(t*15),2));
    });
  };
  function revealLine(path) {
    if(!path||motionOff()||typeof path.animate!=='function')return;
    let length=0;
    try{length=path.getTotalLength()}catch(_){}
    if(!Number.isFinite(length)||length<=0)return;
    path.animate([
      {strokeDasharray:String(length),strokeDashoffset:String(length),opacity:.55},
      {strokeDasharray:String(length),strokeDashoffset:'0',opacity:1}
    ],{duration:850,easing:'cubic-bezier(.22,.7,.24,1)'});
  }
  function drawSpark(id,values) {
    const el=$(id);
    if(!el)return;
    const next=plot(values,300,90,4);
    if(el.getAttribute('d')===next)return;
    el.setAttribute('d',next);
    if(next)revealLine(el);
  }
  function drawAnalytics() {
    const g=$('analytics-lines');if(!g)return;
    g.replaceChildren();
    for(let i=0;i<=4;i++)g.appendChild(svg('line',{
      x1:18,y1:18+i*57,x2:682,y2:18+i*57,stroke:'currentColor',
      'stroke-opacity':'.10','stroke-width':1
    }));
    const live=state.mode==='live';
    const rows=state.session;
    const count=state.period==='day'?48:state.period==='week'?35:30;
    const phase=state.period==='day'?0:state.period==='week'?1:2;
    const lines=live?[
      [rows.map(x=>x.soc),'#4bd5a1'],
      [rows.map(x=>x.powerW),'#f2b46e']
    ]:[
      [demoSeries('home',count,phase),'#4bd5a1'],
      [demoSeries('solar',count,phase),'#f2b46e'],
      [demoSeries('grid',count,phase),'#78b9ed']
    ];
    for(const [values,color] of lines){
      const d=plot(values,700,270,18);
      if(d){const line=svg('path',{d,stroke:color,'stroke-width':2.8,fill:'none'});g.appendChild(line);revealLine(line);}    }
    const labels=live?['НАЧАЛО','','','', 'СЕЙЧАС']:
      state.period==='day'?['00:00','06:00','12:00','18:00','24:00']:
      state.period==='week'?['Пн','Вт','Ср','Чт','Пт']:['1','8','15','22','30'];
    document.querySelectorAll('.chart-axis span').forEach((el,i)=>{el.textContent=labels[i]||'';});
    const legends=document.querySelectorAll('.chart-legend span');
    if(legends[0])legends[0].lastChild.textContent=live?' SOC':' Нагрузка';
    if(legends[1])legends[1].lastChild.textContent=live?' Мощность АКБ':' PV';
    if(legends[2])legends[2].hidden=live;
    document.querySelectorAll('[data-period]').forEach(button=>{
      button.disabled=live;
    });
    const stats=document.querySelectorAll('.analytic-stats .metric-card');
    const titles=live?['SOC','Мощность батареи','Разброс ячеек']:['Генерация PV*','Потребление*','Импорт сети*'];
    stats.forEach((card,i)=>{const node=card.querySelector('.metric-title');if(node)node.textContent=titles[i];});
    const note=$('page-analytics').querySelector('.disclaimer');
    note.textContent=live?
      (state.last?.fresh?'Измерения JK-BMS · графики хранятся только в памяти этой вкладки с момента подключения. Нет измерений домашней нагрузки, PV и городской сети.':'Текущие данные JK-BMS недоступны. График не обновляется до восстановления связи.') :
      'Демонстрационные графики и энергетический баланс. JK-BMS не измеряет солнечную генерацию, потребление дома и городскую сеть.';
    const heading=$('page-analytics').querySelector('.section-heading p');
    heading.textContent=live?'Реальные измерения батареи за текущий сеанс (без записи на диск)':'Пример временных графиков. Исторические данные не записываются.';
    const info=$('page-analytics').querySelector('.analytics-card .info-chip');
    info.textContent=live?'JK-BMS / SESSION':'SIMULATED';
    const graph=$('analytics-chart');graph.setAttribute('aria-label',live?'Изменения SOC и мощности батареи; каждый ряд имеет свою шкалу':'Демонстрационные потоки PV, дома и сети');
  }
  function renderCells(cells,telemetry=null) {
    const wrap=$('cells-bars');wrap.replaceChildren();
    const live=state.mode==='live';
    const present=Array.isArray(cells)&&cells.length===8&&cells.every(Number.isFinite);
    const low=present?Math.min(...cells):null,high=present?Math.max(...cells):null;
    setText('cells-data-label',live?(present?'JK-BMS · LIVE':'НЕТ ДАННЫХ'):'DEMO');
    setText('cell-min',present?low.toFixed(3)+' В':'—');
    setText('cell-max',present?high.toFixed(3)+' В':'—');
    setText('cell-delta',present?Math.round((high-low)*1000)+' мВ':'—');
    setText('balancer-current',telemetry?.balanceA!=null?telemetry.balanceA.toFixed(3)+' А':live?'—':'0.180 А · DEMO');
    setText('mos-temperature',telemetry?.mosTemp!=null?telemetry.mosTemp.toFixed(1)+' °C':live?'—':'27.2 °C · DEMO');
    setText('soh-data',telemetry?.soh!=null?telemetry.soh+'%':live?'—':'99% · DEMO');
    for(let i=0;i<8;i++){
      const v=present?cells[i]:null;
      const cell=document.createElement('div');cell.className='cell-column';
      if(v!==null&&v===low)cell.classList.add('cell-low');
      if(v!==null&&v===high)cell.classList.add('cell-high');
      const voltage=document.createElement('b');voltage.textContent=v!==null?v.toFixed(3):'—';
      const bar=document.createElement('div');bar.className='cell-tower';
      const fill=document.createElement('span');fill.style.height=v===null?'0%':Math.max(8,Math.min(100,(v-2.7)/.95*100))+'%';
      bar.appendChild(fill);
      const index=document.createElement('small');index.textContent=String(i+1).padStart(2,'0');
      cell.append(voltage,bar,index);
      if(telemetry?.cellResistances?.[i]!=null)cell.title=telemetry.cellResistances[i]+' мΩ';
      wrap.appendChild(cell);
    }
  }
  function setBatteryArtwork(soc,mode,power) {
    const known=soc!==null&&Number.isFinite(soc);
    const ring=$('battery-ring');
    ring.style.setProperty('--ring-deg',(known?soc*3.6:0)+'deg');
    ring.dataset.mode=known?mode:'offline';
    $('soc-progress').style.width=known?soc+'%':'0%';
    const rect=$('art-battery-fill');
    rect.setAttribute('y','254');
    rect.setAttribute('height','38');
    rect.style.transform='scaleY('+(known?Math.max(0,Math.min(1,soc/100)):0)+')';
    const map=$('energy-map');
    map.dataset.battery=known?mode:'offline';
    const velocity=Math.max(.48,Math.min(2.8,2.7-Math.abs(power||0)/700));
    map.style.setProperty('--motion-battery',velocity.toFixed(2)+'s');
    map.style.setProperty('--battery-speed',velocity.toFixed(2)+'s');
    const scene=$('scene-visual');
    scene.dataset.battery=known?mode:'offline';
    scene.style.setProperty('--motion-battery',velocity.toFixed(2)+'s');
    // The house illustration never claims to measure real AC/PV flows.
    document.querySelectorAll('.energy-pulse').forEach(path=>{
      path.style.opacity=state.mode==='live'?'0.08':Math.abs(power||0)>10?'1':'0.1';
      path.style.animationDirection=mode==='charge'?'reverse':'normal';
    });
  }
  function setReadouts(telemetry) {
    const real=state.mode==='live',known=telemetry&&Number.isFinite(telemetry.soc);
    const soc=known?telemetry.soc:null,voltage=known?telemetry.voltage:null,
      current=known?telemetry.current:null,power=known?telemetry.powerW:null;
    const mode=!known?'offline':power>10?'charge':power< -10?'discharge':'idle';
    const stateName={charge:'Заряд',discharge:'Разряд',idle:'Покой',offline:'Нет данных'}[mode];
    setText('hero-soc',known?Math.round(soc):'—');
    setText('hero-mode',stateName);
    const topState=document.querySelector('.scene-top>span:first-child');
    if(topState)topState.textContent=real?(known?'● JK-BMS · актуальные данные':'● JK-BMS · нет свежих данных'):'● Интерактивная симуляция';
    setText('scene-soc',known?Math.round(soc):'—');
    setText('metric-soc',known?Math.round(soc):'—');
    setText('ring-soc',known?Math.round(soc):'—');
    setText('metric-voltage',known?voltage.toFixed(2):'—');
    setText('metric-current',known?current.toFixed(2):'—');
    setText('metric-power',known?Math.round(Math.abs(power)):'—');
    setText('map-battery',known?fmt(power):'—');
    setText('map-direction',stateName);
    setText('soc-status',mode==='charge'?'Аккумулятор заряжается':mode==='discharge'?'Аккумулятор разряжается':stateName);
    setText('power-direction',mode==='charge'?'Получает энергию':mode==='discharge'?'Отдаёт энергию':mode==='idle'?'Передача энергии отсутствует':'Нет измерений');
    setText('battery-state',stateName);
    const temp=real?telemetry?.temperature1:null;
    const temperature=real?(temp!=null?temp.toFixed(1)+' °C':'—'):'24.1 °C · DEMO';
    const tempNode=$('battery-ring').closest('.battery-card').querySelector('.battery-extra>div:first-child b');
    if(tempNode)tempNode.textContent=temperature;
    setText('chart-soc-summary',known?pct(soc):'—');
    setText('chart-load-summary',known?fmt(power):'—');
    setText('analytics-solar',real?(known?pct(soc):'—'):fmt(state.demo.solarW));
    setText('analytics-home',real?(known?fmt(power):'—'):fmt(state.demo.homeW));
    setText('analytics-grid',real?(known?telemetry.cellDeltaMv+' мВ':'—'):signedPower(engine.calculate(state.demo).gridW));
    setBatteryArtwork(soc,mode,power);
    if(real){
      ['scene-solar','scene-home','scene-grid','map-solar','map-home','map-grid'].forEach(id=>setText(id,'—'));
      $('energy-map').dataset.available='live';
      ['solar','home','grid'].forEach(id=>$('energy-map').dataset[id]='off');
      setText('flow-source',known?'JK-BMS · LIVE':'НЕ ПОДКЛЮЧЕНО');
      setText('map-note',known?
        'Пульсация показывает только заряд/разряд аккумулятора по данным JK-BMS. Производство PV, нагрузка и городская сеть не подключены.':
        'Измерения батареи недоступны. Анимация остановлена. PV, сеть и дом не измеряются BMS.');
      $('scene-visual').dataset.live='true';
      const explanation=$('page-home').querySelector('.scene-bottom span');
      explanation.textContent='Схема дома иллюстративная. Только батарея подключена к JK-BMS; показатели PV, сети и дома неизвестны.';
    }else{
      const m=engine.calculate(state.demo);
      setText('scene-solar',fmt(m.solarW));setText('scene-home',fmt(m.homeW));
      setText('scene-grid',signedPower(m.gridW));
      setText('map-solar',fmt(m.solarW));setText('map-home',fmt(m.homeW));
      setText('map-grid',signedPower(m.gridW));
      const diagram=$('energy-map');
      diagram.dataset.available='demo';
      diagram.dataset.solar=m.solarW>10?'on':'off';
      diagram.dataset.home=m.homeW>10?'on':'off';
      diagram.dataset.grid=Math.abs(m.gridW)>10?'on':'off';
      diagram.dataset.gridDirection=m.gridW< -10?'export':'import';
      const seconds=n=>Math.max(.46,Math.min(2.7,2.6-Math.abs(n||0)/900)).toFixed(2)+'s';
      diagram.style.setProperty('--motion-solar',seconds(m.solarW));
      diagram.style.setProperty('--motion-home',seconds(m.homeW));
      diagram.style.setProperty('--motion-grid',seconds(m.gridW));
      setText('flow-source','Модель · DEMO');
      setText('map-note','Направление и скорость частиц соответствуют демонстрационному балансу. PV, сеть и дом не измеряются BMS.');
      $('scene-visual').dataset.live='false';
      $('page-home').querySelector('.scene-bottom span').textContent='Демонстрационные значения. Это иллюстрация работы системы, не реальные измерения инвертора.';
    }
    const chips=document.querySelectorAll('.two-cards .info-chip');
    chips.forEach(chip=>{chip.textContent=real?'ТЕКУЩИЙ СЕАНС':'24 ч · DEMO';});
    const secondCard=$('chart-load-summary').closest('.info-card').querySelector('.card-head>span:first-child');
    secondCard.textContent=real?'Мощность батареи':'Энергопотребление';
    const cardSmall=$('chart-load-summary').closest('.card-stat').querySelector('small');
    if(cardSmall)cardSmall.textContent=real?'Измеренная мощность JK-BMS':'Условная нагрузка';
    $('battery-ring').closest('.battery-card').querySelector('.info-chip').lastChild.textContent=real?(known?' LIVE':' OFFLINE'):' DEMO';
    setText('cells-data-label',real?(known?'LIVE':'НЕТ ДАННЫХ'):'DEMO');
  }
  function render() {
    const live=state.mode==='live',value=live?state.last:null;
    const data=live?(value?.fresh?{
      soc:value.soc,voltage:value.pack,current:value.current,powerW:value.powerW,
      cellDeltaMv:value.cellDeltaMv,temperature1:value.temperature1,
    }:null):(()=>{
      const d=engine.calculate(state.demo);
      return {soc:d.soc,voltage:d.voltage,current:d.current,powerW:d.batteryW,cellDeltaMv:10};
    })();
    setReadouts(data);
    renderCells(live?(value?.fresh?value.cells:null):bms.demoCells(state.demo.soc),live&&value?.fresh?value:null);
    if(live){
      drawSpark('spark-soc',state.session.map(x=>x.soc));
      drawSpark('spark-load',state.session.map(x=>x.powerW));
    }else{
      drawSpark('spark-soc',demoSeries('soc',26,0));
      drawSpark('spark-load',demoSeries('home',26,0));
    }
    drawAnalytics();
    Object.entries({soc:'soc',current:'current',solar:'solarW',load:'homeW'}).forEach(([id,key])=>{
      if($(id))$(id).value=String(state.demo[key]);
    });
    setText('out-soc',pct(state.demo.soc));setText('out-current',currentFormat(state.demo.current));
    setText('out-solar',fmt(state.demo.solarW));setText('out-load',fmt(state.demo.homeW));
    const sim=$('flow-demo-controls');if(sim){
      sim.open=!live;
      sim.classList.toggle('hidden-in-live',live);
    }
    $('top-mode').textContent=live?(value?.fresh?'● LIVE':'● OFFLINE'):'● DEMO';
    $('use-demo').classList.toggle('active',!live);
    $('use-live').classList.toggle('active',live);
    $('use-demo').setAttribute('aria-pressed',String(!live));
    $('use-live').setAttribute('aria-pressed',String(live));
    const cardBadge=$('page-home').querySelector('.online-tag');
    if(cardBadge){
      cardBadge.textContent=live?(value?.fresh?'● BMS ОНЛАЙН':'● НЕТ ДАННЫХ'):'● ДЕМО';
      cardBadge.dataset.state=live?(value?.fresh?'online':'offline'):'demo';
    }
    const deviceStatus=$('page-devices').querySelector('.device-row .device-status');
    deviceStatus.textContent=live?(value?.fresh?'Онлайн':'Нет данных'):'Демо';
    deviceStatus.className='device-status '+(live?(value?.fresh?'simulation':'unknown'):'simulation');
    const deviceSubtitle=$('page-devices').querySelector('.device-row small');
    deviceSubtitle.textContent=live?
      (value?.fresh?('JK-BMS · '+value.pack.toFixed(2)+' В · '+value.current.toFixed(2)+' А · '+value.ageMs+' мс'):'Нет свежей телеметрии от JK-BMS'):
      'Напряжение, ток, SOC, температура и ячейки (DEMO)';
    const secondRow=$('page-devices').querySelectorAll('.device-row')[1];
    if(secondRow)secondRow.querySelector('small').textContent=live?'Данные читаются с ESP32 через локальный мост':'Локальная демоверсия; устройство не подключено';
    const footerStatus=document.querySelector('.side-footer small');
    if(footerStatus)footerStatus.textContent=live?(value?.fresh?'JK-BMS · только чтение':'Нет свежей связи с JK-BMS'):'Нет подключения к оборудованию';
    const settingData=$('page-settings').querySelectorAll('.settings-row')[1];
    settingData.querySelector('small').textContent=live?'JK-BMS /api/status (только чтение)':'Встроенная модель — без сетевых запросов';
    settingData.querySelector('.info-chip').textContent=live?'LIVE':'DEMO';
    const settingConnection=$('page-settings').querySelectorAll('.settings-row')[2];
    settingConnection.querySelector('small').textContent=state.tokenConfigured?'Локальный защищённый ключ просмотра установлен':'Для LIVE потребуется ключ просмотра';
    settingConnection.querySelector('.device-status').textContent=state.tokenConfigured?'Настроено':'Выключено';
  }
  function rememberSample(value){
    if(!value?.fresh)return;
    if(Number.isFinite(value.sampleCount)&&state.lastSample===value.sampleCount)return;
    state.lastSample=value.sampleCount;
    state.session.push({timestamp:toSeconds(),soc:value.soc,powerW:value.powerW,pack:value.pack,deltaMv:value.cellDeltaMv});
    if(state.session.length>480)state.session.shift();
  }
  function setMode(mode){
    if(mode==='live')stopAutoDemo();
    state.mode=mode;
    if(wifiDemoOnly&&mode==='live'){state.mode='demo';return;}
    if(mode==='demo'){
      state.status='demo';state.last=null;
      statusMessage('Тестовые показатели · симуляция');
      render();
      return;
    }
    state.status='connecting';
    state.last=null;render();
    statusMessage('Проверяю связь с ESP32…');
    if(!state.tokenConfigured){
      statusMessage('Нужен ключ просмотра. Открой настройки.','warning');
      connectionMessage('Сначала создай ключ только для чтения в админке ESP32.','warning');
      location.hash='#settings';return;
    }
    poll();
  }
  async function poll(){
    if(state.mode!=='live'||state.polling||document.hidden||!state.tokenConfigured)return;
    state.polling=true;
    try{
      const raw=await bridgeRequest('status');
      if(state.mode!=='live')return;
      const value=bms.normalize(raw);
      state.last=value;
      if(value.fresh){
        rememberSample(value);
        state.status='online';
        statusMessage('● BMS онлайн · обновление каждые 3 с','success');
        connectionMessage('Подключено. Данные JK-BMS обновляются без права управления.','success');
      }else{
        state.status='stale';
        statusMessage(value.connected?'● Показания устарели':'● Bluetooth отключён','warning');
        connectionMessage('Нет свежего пакета JK-BMS; измерения скрыты до восстановления связи.','warning');
      }
    }catch(err){
      if(state.mode!=='live')return;
      state.status=err.code===401?'auth':'error';
      state.last=null;
      statusMessage(err.code===401?'Ключ недействителен / 401':'ESP32 недоступна · повторная попытка','error');
      connectionMessage(err.code===401?
        'ESP32 отклонила ключ. Создай отдельный действительный ключ просмотра и подключи его ещё раз.':
        'Не удалось прочитать ESP32. Проверь Wi-Fi и адрес устройства.','error');
    }finally{
      state.polling=false;
      if(state.mode==='live')render();
    }
  }
  // Wi-Fi iPhone preview is static-only: never prompt for a BMS key over LAN HTTP.
  const wifiDemoOnly = window.location.protocol.startsWith('http') &&
    !['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);
  function lockToWifiDemo() {
    for (const id of ['use-live','reader-token','connect-btn','refresh-btn','disconnect-btn']) {
      const control=$(id);
      if (control) control.disabled=true;
    }
    $('use-live').title='В Wi-Fi-просмотре доступен только DEMO. Для реальных измерений открой локальный интерфейс на компьютере.';
    const intro=$('connection-panel').querySelector('.connection-intro p');
    if (intro) intro.textContent='На iPhone доступен безопасный просмотр дизайна и анимаций. Этот сервер не подключается к BMS и не принимает ключи.';
    const form=$('connection-form');
    if (form) form.hidden=true;
    const actions=$('connection-panel').querySelector('.connection-actions');
    if (actions) actions.hidden=true;
    statusMessage('PWA · только DEMO', 'neutral');
    connectionMessage('Публичная PWA работает только с симуляцией: без ключей, телеметрии и управления.');  }
  async function initBridge(){
    if (wifiDemoOnly) { lockToWifiDemo(); return; }
    if(!window.location.protocol.startsWith('http')){connectionMessage('Мост работает через локальный сервер. Открой http://127.0.0.1:8765/fusionsolar/');return;}
    try{
      const result=await bridgeRequest('state');
      state.tokenConfigured=result.token_configured===true;
      if(state.tokenConfigured)setMode('live');
      else connectionMessage('Ключ не установлен. Для подключения создай отдельный ключ просмотра в панели ESP32.');
    }catch(_){connectionMessage('Локальный сервер недоступен или ещё не обновлён. Перезапусти ui-local/start.cmd.','error');}
  }
  $('connection-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const input=$('reader-token');const token=input.value.trim().toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(token)){
      input.value='';connectionMessage('Нужен ключ просмотра в формате 64 шестнадцатеричных символов.','error');return;
    }
    const btn=$('connect-btn');btn.disabled=true;
    try{
      await bridgeRequest('token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
      state.tokenConfigured=true;state.lastSample=null;state.session.length=0;
      connectionMessage('Ключ получен локальным сервером. Проверяю соединение…');
      setMode('live');location.hash='#home';
    }catch(_){connectionMessage('Не удалось передать ключ локальному серверу.','error');}
    finally{input.value='';btn.disabled=false;}
  });
  $('disconnect-btn').addEventListener('click',async()=>{
    try{
      await bridgeRequest('disconnect',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      state.tokenConfigured=false;state.lastSample=null;state.session.length=0;
      connectionMessage('Ключ удалён из памяти локального сервера.','success');
      setMode('demo');
    }catch(_){connectionMessage('Не удалось отключить источник. Останови локальный сервер, чтобы сбросить ключ.','error');}
  });
  $('refresh-btn').addEventListener('click',()=>{if(!state.tokenConfigured){connectionMessage('Сначала настрой ключ просмотра.','warning');return;}if(state.mode!=='live')setMode('live');else poll();});
  $('use-demo').addEventListener('click',()=>setMode('demo'));
  $('use-live').addEventListener('click',()=>setMode('live'));
  let autoDemoTimer=null;
  let autoDemoIndex=0;
  const demoSequence=['battery','grid','sun','idle'];
  function stopAutoDemo() {
    if(autoDemoTimer!==null){clearInterval(autoDemoTimer);autoDemoTimer=null;}
    const button=$('auto-demo');
    if(button){button.textContent='▶ Автодемо';button.setAttribute('aria-pressed','false');}
  }
  function cycleDemo() {
    if(state.mode!=='demo'||document.hidden)return;
    const preset=demoSequence[autoDemoIndex++%demoSequence.length];
    Object.assign(state.demo,presets[preset]);
    render();
    statusMessage('DEMO · сценарий '+({'battery':'От АКБ','grid':'От сети','sun':'PV + заряд','idle':'Покой'}[preset]));
  }
  $('auto-demo').addEventListener('click',()=>{
    if(autoDemoTimer!==null){stopAutoDemo();statusMessage('DEMO · управление вручную');return;}
    if(state.mode!=='demo')setMode('demo');
    cycleDemo();
    autoDemoTimer=setInterval(cycleDemo,6500);
    $('auto-demo').textContent='Ⅱ Остановить';
    $('auto-demo').setAttribute('aria-pressed','true');
  });
  for(const [id,key] of Object.entries({soc:'soc',current:'current',solar:'solarW',load:'homeW'})){
    $(id).addEventListener('input',event=>{stopAutoDemo();state.demo[key]=Number(event.target.value);if(state.mode==='demo')render();});
  }
  document.querySelectorAll('[data-preset]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      stopAutoDemo();
      Object.assign(state.demo,presets[btn.dataset.preset]);
      if(state.mode==='demo')render();
    });
  });
  function navigate(){
    const key=location.hash.slice(1),name=['home','analytics','devices','settings'].includes(key)?key:'home';
    document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+name));
    document.querySelectorAll('[data-target]').forEach(button=>{
      const active=button.dataset.target===name;button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    if(name==='analytics')drawAnalytics();
    window.scrollTo({top:0,behavior:'instant'});
  }
  document.querySelectorAll('[data-target]').forEach(btn=>btn.addEventListener('click',()=>{
    const hash='#'+btn.dataset.target;
    if(location.hash===hash)navigate();else location.hash=hash;
  }));
  window.addEventListener('hashchange',navigate);
  document.querySelectorAll('[data-period]').forEach(btn=>btn.addEventListener('click',()=>{
    if(state.mode==='live')return;
    state.period=btn.dataset.period;
    document.querySelectorAll('[data-period]').forEach(el=>el.classList.toggle('active',el===btn));
    drawAnalytics();
  }));
  function setTheme(theme){
    state.theme=theme==='light'?'light':'dark';
    document.body.dataset.theme=state.theme;
    $('theme-switch').setAttribute('aria-checked',String(state.theme==='dark'));
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.content=state.theme==='dark'?'#111B28':'#0A59F7';    try{localStorage.setItem('energy-nova-v2-theme',state.theme);}catch(_){}
  }
  try{state.theme=localStorage.getItem('energy-nova-v2-theme')==='dark'?'dark':'light';}catch(_){}
  $('theme-top').addEventListener('click',()=>setTheme(state.theme==='dark'?'light':'dark'));
  $('theme-switch').addEventListener('click',()=>setTheme(state.theme==='dark'?'light':'dark'));  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.mode==='live')poll();});
  setInterval(()=>{if(state.mode==='live')poll();},3000);
  setTheme(state.theme);render();navigate();initBridge();
})();
