(function (global) {
  'use strict';

  const LANG_KEY = 'wtg_lang_v1';

  const LANGUAGES = [
    { id: 'zh-CN', code: '简', name: '简体中文', sub: 'Simplified Chinese' },
    { id: 'zh-TW', code: '繁', name: '繁體中文', sub: 'Traditional Chinese' },
    { id: 'en', code: 'EN', name: 'English', sub: '英语' }
  ];

  // OS-verified 1-to-1 Simplified -> Traditional Chinese pairs covering all 722 destinations
  const S2T_PAIRS = '万萬与與专專业業丛叢东東丝絲丢丟两兩严嚴丧喪个個丰豐临臨为為丽麗举舉义義乌烏乐樂乔喬习習乡鄉书書买買乱亂争爭亏虧亘亙亚亞产產亩畝亲親亿億仅僅从從仑侖仓倉仪儀们們价價众眾优優会會伞傘伟偉传傳伤傷伦倫伪偽伫佇体體佣傭侠俠侣侶侦偵侧側侨僑倾傾偿償储儲儿兒兑兌党黨兰蘭关關兴興兹茲养養兽獸内內冈岡册冊写寫军軍农農冯馮冲沖决決况況冻凍净凈准準凉涼减減凑湊凛凜几幾凤鳳凭憑凯凱凶兇击擊凿鑿划劃刘劉则則刚剛创創删刪别別刹剎剂劑剐剮剑劍剥剝剧劇劝勸办辦务務动動励勵劲勁劳勞势勢勋勛匀勻区區医醫华華协協单單卖賣卢盧卤鹵卧臥卫衛却卻厂廠厅廳历歷厉厲压壓厌厭厕廁厢廂厦廈厨廚厮廝县縣参參双雙发發变變叙敘叠疊台臺叶葉号號叹嘆吓嚇吕呂吨噸听聽启啟吴吳员員呜嗚咏詠响響哑啞哗嘩唤喚啸嘯喷噴噜嚕嚣囂团團园園囱囪围圍国國图圖圆圓场場坏壞块塊坚堅坛壇坝壩坞塢坟墳坠墜垄壟垒壘垦墾垩堊垫墊垭埡堑塹堕墮墙墻壮壯声聲壳殼壶壺处處备備复復够夠头頭夹夾夺奪奂奐奋奮奖獎奥奧妆妝妇婦妈媽娄婁娅婭娇嬌娱娛婴嬰孙孫学學孪孿宁寧宝寶实實宠寵审審宪憲宫宮宽寬宾賓寝寢对對寻尋导導寿壽将將尔爾尘塵尝嘗尽盡层層届屆属屬屡屢屿嶼岁歲岖嶇岗崗岘峴岚嵐岛島岩巖岭嶺峡峽峦巒崂嶗巅巔巩鞏币幣帅帥师師帐帳帘簾帜幟带帶帧幀帮幫广廣庄莊庆慶庐廬库庫应應庙廟庞龐废廢开開异異弃棄张張弥彌弯彎弹彈强強归歸当當录錄彦彥彻徹径徑徕徠忆憶忏懺忧憂怀懷态態怆愴总總怼懟恋戀恶惡恼惱悦悅悬懸悯憫惊驚惧懼惨慘惫憊惬愜惯慣慑懾懒懶戏戲战戰户戶扑撲执執扩擴扫掃扬揚扰擾抚撫抛拋抢搶护護报報担擔拟擬拢攏拥擁拦攔拧擰拨撥择擇挂掛挚摯挝撾挞撻挟挾挠撓挡擋挤擠挥揮捞撈损損捡撿换換据據掷擲掸撣揽攬搁擱搅攪携攜摄攝摆擺摇搖摊攤撑撐撵攆撸擼攒攢敌敵敛斂数數斋齋斓斕斩斬断斷无無旧舊时時旷曠昼晝显顯晋晉晒曬晓曉晕暈晖暉暂暫术術朴樸机機杀殺杂雜权權杆桿条條来來杨楊极極构構枞樅枢樞枣棗枪槍枫楓柠檸柽檉栀梔栅柵标標栈棧栊櫳栋棟栌櫨栎櫟栏欄树樹栖棲样樣栾欒桠椏桢楨档檔桤榿桥橋桦樺桧檜桨槳桩樁梦夢检檢椤欏椭橢楼樓榄欖榈櫚榉櫸槛檻槟檳横橫樱櫻橱櫥橹櫓欢歡欧歐殇殤残殘毁毀毕畢毡氈气氣氢氫氲氳汇匯汉漢汤湯汹洶沟溝没沒沥瀝沦淪沧滄泞濘泪淚泷瀧泸瀘泻瀉泼潑泽澤泾涇洁潔洒灑浅淺浆漿浇澆浊濁测測济濟浏瀏浑渾浓濃涛濤涝澇涟漣涠潿涡渦涤滌润潤涧澗涨漲涩澀渊淵渍漬渐漸渔漁渗滲温溫湾灣湿濕溃潰溅濺滚滾滞滯满滿滤濾滥濫滨濱滩灘潇瀟潋瀲潜潛澜瀾濑瀨濒瀕灭滅灯燈灵靈灾災灿燦炉爐炖燉点點炼煉炽熾烁爍烂爛烛燭烟煙烦煩烧燒烩燴烫燙烬燼热熱焕煥焖燜爱愛爷爺牵牽犊犢状狀犷獷犹猶狞獰独獨狭狹狮獅狰猙狱獄狸貍猎獵猕獼猪豬猫貓献獻獭獺玛瑪环環现現珐琺珑瓏琅瑯琼瓊瑶瑤瓮甕电電画畫畅暢畴疇疗療疟瘧疯瘋症癥痒癢痪瘓痴癡瘫癱瘾癮皑皚皱皺盏盞盐鹽监監盖蓋盗盜盘盤着著睁睜睐睞矶磯矾礬矿礦码碼砖磚砚硯砺礪砾礫础礎硕碩确確碍礙碛磧碱堿礼禮祷禱禄祿禅禪离離秃禿种種积積称稱税稅稣穌稳穩穷窮窃竊窑窯窜竄窝窩窥窺竖豎竞競笃篤笋筍笔筆笼籠筛篩筝箏筹籌签簽简簡篮籃篱籬类類粝糲粤粵粪糞粮糧紧緊纠糾红紅纤纖约約级級纪紀纬緯纯純纱紗纳納纵縱纷紛纸紙纹紋纺紡纽紐线線练練组組细細织織终終绊絆绍紹绎繹经經绑綁绒絨结結绕繞绘繪给給绚絢绛絳络絡绝絕绞絞统統绢絹绣繡继繼续續绮綺绯緋绰綽绳繩维維绵綿绷繃绸綢综綜绽綻绿綠缀綴缅緬缆纜缈緲缎緞缓緩缔締缕縷编編缘緣缚縛缝縫缟縞缠纏缤繽缥縹缦縵缩縮缪繆缭繚缮繕缴繳罂罌网網罗羅罚罰罢罷翘翹耧耬耸聳聋聾职職联聯肃肅肠腸肤膚肾腎胀脹胁脅胆膽胜勝胧朧胶膠脉脈脏臟脑腦脚腳脱脫脸臉腊臘腻膩腾騰舰艦舱艙艰艱艳艷艺藝节節芜蕪芦蘆苇葦苍蒼苏蘇苹蘋茎莖茏蘢荆荊荐薦荚莢荞蕎荟薈荡蕩荣榮荧熒荨蕁荫蔭药藥莱萊莲蓮获獲莹瑩萝蘿萤螢营營萦縈萧蕭萨薩葱蔥蒋蔣蓝藍蓟薊蓦驀蔷薔蕴蘊薮藪藓蘚虏虜虑慮虚虛虫蟲虽雖虾蝦蚀蝕蚁蟻蚂螞蚕蠶蚝蠔蚬蜆蛎蠣蛏蟶蛮蠻蛰蟄蜕蛻蜡蠟蝇蠅蝉蟬衅釁衔銜补補衬襯袄襖袅裊袜襪袭襲装裝裤褲见見观觀规規觅覓视視览覽觉覺觑覷触觸誉譽计計订訂认認讨討让讓训訓议議讯訊记記讲講讶訝讷訥许許论論设設访訪诀訣证證评評识識诉訴诊診词詞诏詔译譯试試诗詩诚誠话話诞誕诠詮诡詭询詢诣詣该該详詳语語误誤诱誘说說诵誦请請诸諸诺諾读讀课課调調谈談谊誼谋謀谐諧谓謂谕諭谛諦谜謎谟謨谢謝谣謠谧謐谨謹谱譜谲譎贝貝负負贡貢财財责責贤賢败敗账賬货貨质質贩販贪貪贫貧购購贯貫贴貼贵貴贶貺贸貿费費贺賀贼賊贾賈赁賃资資赋賦赏賞赐賜赖賴赚賺赛賽赞贊赠贈赣贛赵趙赶趕趋趨跃躍践踐跷蹺踪蹤蹒蹣躯軀车車轨軌轩軒转轉轭軛轮輪软軟轰轟轴軸轸軫轻輕轼軾载載轿轎较較辄輒辅輔辆輛辈輩辉輝辐輻辑輯输輸辖轄辙轍辞辭辩辯辫辮边邊辽遼达達迁遷过過迈邁运運还還这這进進远遠违違连連迟遲迹跡适適选選逊遜递遞逻邏遗遺遥遙邓鄧邬鄔邮郵邺鄴邻鄰郑鄭酝醞酱醬酿釀释釋鉴鑒銮鑾针針钉釘钏釧钓釣钙鈣钛鈦钝鈍钞鈔钟鐘钠鈉钢鋼钥鑰钦欽钩鉤钱錢钴鈷钵缽钻鉆钾鉀铀鈾铁鐵铃鈴铅鉛铆鉚铛鐺铜銅铝鋁铠鎧铫銚铬鉻铭銘铲鏟银銀铸鑄铺鋪链鏈销銷锁鎖锂鋰锅鍋锈銹锋鋒锌鋅锐銳错錯锚錨锡錫锣鑼锤錘锥錐锦錦键鍵锯鋸锰錳锻鍛镀鍍镁鎂镂鏤镇鎮镌鐫镐鎬镑鎊镛鏞镜鏡镯鐲镰鐮镶鑲长長门門闪閃闭閉问問闯闖闲閑间間闷悶闸閘闹鬧闻聞闽閩闾閭阀閥阁閣阅閱阈閾阔闊阙闕队隊阳陽阴陰阵陣阶階际際陆陸陇隴陈陳陕陜陨隕险險随隨隐隱隶隸难難雏雛雳靂雾霧霁霽霭靄静靜鞑韃韦韋韧韌韩韓韵韻页頁顶頂顷頃项項顺順须須顽頑顾顧顿頓颂頌预預领領颇頗颈頸颊頰颌頜颐頤频頻颗顆题題颜顏额額颠顛颤顫风風飑颮飒颯飓颶飘飄飙飆飞飛飨饗饥饑饨飩饪飪饭飯饮飲饰飾饱飽饵餌饶饒饺餃饼餅饿餓馄餛馅餡馆館馈饋馍饃馏餾馒饅馔饌马馬驮馱驯馴驰馳驱驅驳駁驴驢驶駛驹駒驻駐驼駝驾駕驿驛骆駱骇駭骊驪骋騁验驗骏駿骑騎骗騙骚騷骞騫骡騾骤驟髅髏鱼魚鱿魷鲁魯鲍鮑鲑鮭鲔鮪鲜鮮鲟鱘鲢鰱鲣鰹鲤鯉鲨鯊鲭鯖鲱鯡鲷鯛鲸鯨鳄鱷鳌鰲鳍鰭鳐鰩鳕鱈鳗鰻鳜鱖鳝鱔鳞鱗鳟鱒鸟鳥鸠鳩鸡雞鸢鳶鸣鳴鸥鷗鸦鴉鸨鴇鸪鴣鸬鸕鸭鴨鸯鴦鸱鴟鸳鴛鸵鴕鸽鴿鸿鴻鹃鵑鹄鵠鹅鵝鹇鷴鹈鵜鹉鵡鹏鵬鹕鶘鹚鶿鹜鶩鹞鷂鹤鶴鹦鸚鹧鷓鹩鷯鹪鷦鹫鷲鹬鷸鹭鷺鹰鷹鹳鸛麦麥麸麩黄黃鼋黿齐齊齿齒龄齡龙龍龛龕龟龜';
  const S2T_MAP = new Map();
  for (let i = 0; i < S2T_PAIRS.length; i += 2) {
    S2T_MAP.set(S2T_PAIRS[i], S2T_PAIRS[i + 1]);
  }

  function toTraditional(str) {
    if (!str || typeof str !== 'string') return str || '';
    let out = '';
    for (let i = 0; i < str.length; i++) {
      out += S2T_MAP.get(str[i]) || str[i];
    }
    return out;
  }

  const DICT = {
    'zh-CN': {
      appTitle: 'World Travel Globe',
      searchPlaceholderShort: '搜索 722 城与 5,414 机位…',
      palettePlaceholder: '搜索国家、城市、精准机位或英文 ID（如：京都、冰岛、kerala）…',
      modeMap: '地球',
      modeGallery: '图鉴',
      modePlanner: '规划',
      modeArchive: '档案',
      exitFullscreen: '退出全屏',
      statsFmt: '{cities} 城 · {spots} 机位',
      filterTheme: '美学主题',
      filterWeather: '气象与天象',
      filterAll: '全部',
      themeNature: '自然奇观',
      themeArch: '城市建筑',
      weatherAllWeather: '四季皆美',
      weatherSunny: '晴空星空',
      weatherRain: '烟雨云海',
      weatherSnow: '雪景蓝冰',
      weatherSpecial: '极限奇观',
      matchFmt: '{count} 城匹配',
      reset: '重置',
      clear: '清除',
      fitResults: '聚焦结果',
      sidebarTitle: '全球精选目的地',
      legendAllWeather: '四季全天候',
      legendSeasonal: '季节 / 气象限定',
      allYear: '全年',
      monthFmt: '{m}月',
      citiesCountFmt: '{n} 城',
      spotsCountFmt: '{n} 机位',
      skinSatellite: '卫星',
      skinNatgeo: '国家地理',
      skinPhysical: '地形',
      skinDark: '暗夜',
      layersTitle: '地图图层与工具',
      layersMapStyle: '底图风格',
      layersOverlays: '叠加图层',
      layerLabels: '底图地名',
      layerAllLabels: '全量标签',
      layerCluster: '空间聚合',
      layerWeather: '实时云图',
      layerTimeMachine: '地球时光机',
      layerFootprint: '旅行足迹',
      layerDiagnostics: '系统诊断',
      tileRouteAuto: '自动线路',
      tileRouteCn: '国内极速',
      tileRouteGlobal: '国际标准',
      tileRouteWorker: '边缘加速',
      flyChina: '中国',
      flyGlobal: '全球',
      panorama: '全景',
      skipIntro: '跳过飞入',
      tabSpots: '机位',
      tabPhoto: '光影',
      tabMonths: '物候',
      tabWeather: '气候',
      tabBudget: '预算',
      tabItinerary: '动线',
      badgeAllWeather: '四季全天候',
      badgeSeasonal: '季节与气象限定',
      elevationPrefix: '海拔',
      daysPrefix: '建议',
      flyToSpot: '飞往机位',
      goldenHour: '黄金时段：',
      realScene: '实景画面：',
      weatherSunnyTitle: '晴天美学',
      weatherRainyTitle: '雨天 & 雨后初晴',
      weatherSnowyTitle: '雪天 & 冬季限定',
      weatherSpecialTitle: '极限气象奇观',
      weatherTrigger: '触发条件：',
      weatherGear: '装备建议：',
      budgetLuxury: '顶奢尊享档',
      budgetComfort: '舒适深度档',
      approxUsd: '约 {usd} USD',
      hemiNorth: '北半球',
      hemiSouth: '南半球',
      monthArchiveFmt: '{m}月实景档案（{hemi}）',
      recommendScore: '推荐度',
      tempRange: '日均气温',
      climateFeature: '气候特征',
      monthHighlight: '当月物候亮点：',
      provenanceTitle: '数据与坐标核验 · 图鉴版本 v2.0',
      provenanceNote: '坐标、气象与预算整理自实地考察与公开权威地理库，出发前请核对当地最新开放政策。',
      galleryKicker: 'WORLD ATLAS · 722 DESTINATIONS',
      galleryTitle: '全球旅行地理图鉴',
      galleryLead: '按自然奇观、建筑美学、四季全天候与极限气象索引全球 722 座目的地，点选即飞往 3D 实景坐标。',
      backToGlobe: '返回地球',
      galAll: '全部',
      galFav: '收藏',
      galIndex: '追美榜',
      destCountFmt: '{n} 座目的地',
      flyCoord: '飞往坐标',
      loadMore: '继续加载更多（剩余 {n} 座）',
      emptyGallery: '当前图鉴分类下暂无匹配目的地。',
      emptySidebar: '当前筛选条件下暂无匹配目的地，可点击重置。',
      appearanceTitle: '外观与主题色',
      modeNight: '黑夜',
      modeDay: '白天',
      accentPaletteLabel: '主题色盘',
      customColorLabel: '自定义色值',
      languageTitle: '界面语言',
      paletteSelect: '选择',
      paletteLocate: '定位',
      paletteClose: '关闭',
      paletteAllCount: '全部 {n} 座目的地可瞬时检索',
      paletteHitsCount: '命中 {n} 座目的地',
      paletteEmptyTitle: '未找到匹配的城市、国家或机位。',
      paletteClearQuery: '清空搜索词',
      paletteRelaxFilters: '放宽全部筛选',
      hoverAction: '查看 {n} 个机位 →',
      subspotToast: '{name} · {n} 个精准机位',
      loaderText: '正在载入全球 722 座目的地…',
      tourReplay: '新手导览',
      tourWelcomeTitle: '欢迎探索世界',
      tourFeat1Title: '722 座全球秘境',
      tourFeat1Desc: '七大洲 5,414 个精准摄影机位',
      tourFeat2Title: '物候与光影模拟',
      tourFeat2Desc: '12 个月颜值排行与 3D 太阳轨迹',
      tourFeat3Title: '智能行程与足迹',
      tourFeat3Desc: '真实路网规划与私密旅行档案',
      tourStartBtn: '开始导览',
      tourSkipLater: '暂不导览',
      tourSkip: '跳过',
      tourNext: '继续',
      tourFinish: '开始探索',
      tourStep1Title: '主控栏',
      tourStep1Desc: '检索、筛选与个性设置都在这里。',
      tourLegList: '清单',
      tourLegSearch: '搜索 ⌘K',
      tourLegFilter: '筛选',
      tourLegFav: '收藏',
      tourLegTheme: '明暗主题',
      tourLegLang: '三语',
      tourStep2Title: '视图切换',
      tourStep2Desc: '在 3D 地球、图鉴、行程与档案间切换。',
      tourStep3Title: '探索光点',
      tourStep3Desc: '点选任意光点，展开实景、气候与光影指南。',
      tourLegGold: '四季皆美',
      tourLegIce: '季节限定',
      tourStep4Title: '物候时间轴',
      tourStep4Desc: '按出行月份，只看当季巅峰风景。',
      tourStep5Title: '图层与视角',
      tourStep5Desc: '收拢专业图层，随时一键回归视角。',
      tourLegLayers: '图层云图',
      tourLeg3d: '3D/2D',
      tourLegSpin: '自转',
      tourLegFull: '全屏 (F)',
      tourLegRegion: '中国/全球',
      tourLegZoom: '缩放',
      continents: {
        global: '全球', asia: '亚洲', europe: '欧洲', oceania: '大洋洲',
        north_america: '北美洲', south_america: '南美洲', africa_antarctica: '非/南极'
      },
      seasons: ['北冬', '北春', '北夏', '北秋']
    },
    'zh-TW': {
      appTitle: 'World Travel Globe',
      searchPlaceholderShort: '搜尋 722 城與 5,414 機位…',
      palettePlaceholder: '搜尋國家、城市、精準機位或英文 ID（如：京都、冰島、kerala）…',
      modeMap: '地球',
      modeGallery: '圖鑑',
      modePlanner: '規劃',
      modeArchive: '檔案',
      exitFullscreen: '退出全螢幕',
      statsFmt: '{cities} 城 · {spots} 機位',
      filterTheme: '美學主題',
      filterWeather: '氣象與天象',
      filterAll: '全部',
      themeNature: '自然奇觀',
      themeArch: '城市建築',
      weatherAllWeather: '四季皆美',
      weatherSunny: '晴空星空',
      weatherRain: '煙雨雲海',
      weatherSnow: '雪景藍冰',
      weatherSpecial: '極限奇觀',
      matchFmt: '{count} 城符合',
      reset: '重設',
      clear: '清除',
      fitResults: '聚焦結果',
      sidebarTitle: '全球精選目的地',
      legendAllWeather: '四季全天候',
      legendSeasonal: '季節 / 氣象限定',
      allYear: '全年',
      monthFmt: '{m}月',
      citiesCountFmt: '{n} 城',
      spotsCountFmt: '{n} 機位',
      skinSatellite: '衛星',
      skinNatgeo: '國家地理',
      skinPhysical: '地形',
      skinDark: '暗夜',
      layersTitle: '地圖圖層與工具',
      layersMapStyle: '底圖風格',
      layersOverlays: '疊加圖層',
      layerLabels: '底圖地名',
      layerAllLabels: '全量標籤',
      layerCluster: '空間聚合',
      layerWeather: '即時雲圖',
      layerTimeMachine: '地球時光機',
      layerFootprint: '旅行足跡',
      layerDiagnostics: '系統診斷',
      tileRouteAuto: '自動線路',
      tileRouteCn: '國內極速',
      tileRouteGlobal: '國際標準',
      tileRouteWorker: '邊緣加速',
      flyChina: '中國',
      flyGlobal: '全球',
      panorama: '全景',
      skipIntro: '略過飛入',
      tabSpots: '機位',
      tabPhoto: '光影',
      tabMonths: '物候',
      tabWeather: '氣候',
      tabBudget: '預算',
      tabItinerary: '動線',
      badgeAllWeather: '四季全天候',
      badgeSeasonal: '季節與氣象限定',
      elevationPrefix: '海拔',
      daysPrefix: '建議',
      flyToSpot: '飛往機位',
      goldenHour: '黃金時段：',
      realScene: '實景畫面：',
      weatherSunnyTitle: '晴天美學',
      weatherRainyTitle: '雨天 & 雨後初晴',
      weatherSnowyTitle: '雪天 & 冬季限定',
      weatherSpecialTitle: '極限氣象奇觀',
      weatherTrigger: '觸發條件：',
      weatherGear: '裝備建議：',
      budgetLuxury: '頂奢尊享檔',
      budgetComfort: '舒適深度檔',
      approxUsd: '約 {usd} USD',
      hemiNorth: '北半球',
      hemiSouth: '南半球',
      monthArchiveFmt: '{m}月實景檔案（{hemi}）',
      recommendScore: '推薦度',
      tempRange: '日均氣溫',
      climateFeature: '氣候特徵',
      monthHighlight: '當月物候亮點：',
      provenanceTitle: '資料與座標核驗 · 圖鑑版本 v2.0',
      provenanceNote: '座標、氣象與預算整理自實地考察與公開權威地理庫，出發前請核對當地最新開放政策。',
      galleryKicker: 'WORLD ATLAS · 722 DESTINATIONS',
      galleryTitle: '全球旅行地理圖鑑',
      galleryLead: '依自然奇觀、建築美學、四季全天候與極限氣象索引全球 722 座目的地，點選即飛往 3D 實景座標。',
      backToGlobe: '返回地球',
      galAll: '全部',
      galFav: '收藏',
      galIndex: '追美榜',
      destCountFmt: '{n} 座目的地',
      flyCoord: '飛往座標',
      loadMore: '繼續載入更多（剩餘 {n} 座）',
      emptyGallery: '目前圖鑑分類下暫無符合目的地。',
      emptySidebar: '目前篩選條件下暫無符合目的地，可點擊重設。',
      appearanceTitle: '外觀與主題色',
      modeNight: '黑夜',
      modeDay: '白天',
      accentPaletteLabel: '主題色盤',
      customColorLabel: '自訂色碼',
      languageTitle: '介面語言',
      paletteSelect: '選擇',
      paletteLocate: '定位',
      paletteClose: '關閉',
      paletteAllCount: '全部 {n} 座目的地可即時檢索',
      paletteHitsCount: '符合 {n} 座目的地',
      paletteEmptyTitle: '找不到符合的城市、國家或機位。',
      paletteClearQuery: '清空搜尋詞',
      paletteRelaxFilters: '放寬全部篩選',
      hoverAction: '查看 {n} 個機位 →',
      subspotToast: '{name} · {n} 個精準機位',
      loaderText: '正在載入全球 722 座目的地…',
      tourReplay: '新手導覽',
      tourWelcomeTitle: '歡迎探索世界',
      tourFeat1Title: '722 座全球秘境',
      tourFeat1Desc: '七大洲 5,414 個精準攝影機位',
      tourFeat2Title: '物候與光影模擬',
      tourFeat2Desc: '12 個月顏值排行與 3D 太陽軌跡',
      tourFeat3Title: '智慧行程與足跡',
      tourFeat3Desc: '真實路網規劃與私密旅行檔案',
      tourStartBtn: '開始導覽',
      tourSkipLater: '暫不導覽',
      tourSkip: '略過',
      tourNext: '繼續',
      tourFinish: '開始探索',
      tourStep1Title: '主控欄',
      tourStep1Desc: '檢索、篩選與個人化設定都在這裡。',
      tourLegList: '清單',
      tourLegSearch: '搜尋 ⌘K',
      tourLegFilter: '篩選',
      tourLegFav: '收藏',
      tourLegTheme: '明暗主題',
      tourLegLang: '三語',
      tourStep2Title: '視圖切換',
      tourStep2Desc: '在 3D 地球、圖鑑、行程與檔案間切換。',
      tourStep3Title: '探索光點',
      tourStep3Desc: '點選任意光點，展開實景、氣候與光影指南。',
      tourLegGold: '四季皆美',
      tourLegIce: '季節限定',
      tourStep4Title: '物候時間軸',
      tourStep4Desc: '依出行月份，只看當季巔峰風景。',
      tourStep5Title: '圖層與視角',
      tourStep5Desc: '收攏專業圖層，隨時一鍵回歸視角。',
      tourLegLayers: '圖層雲圖',
      tourLeg3d: '3D/2D',
      tourLegSpin: '自轉',
      tourLegFull: '全螢幕 (F)',
      tourLegRegion: '中國/全球',
      tourLegZoom: '縮放',
      continents: {
        global: '全球', asia: '亞洲', europe: '歐洲', oceania: '大洋洲',
        north_america: '北美洲', south_america: '南美洲', africa_antarctica: '非/南極'
      },
      seasons: ['北冬', '北春', '北夏', '北秋']
    },
    en: {
      appTitle: 'World Travel Globe',
      searchPlaceholderShort: 'Search 722 cities & 5,414 spots…',
      palettePlaceholder: 'Search country, city, viewpoint, or ID (e.g. Kyoto, Iceland, kerala)…',
      modeMap: 'Globe',
      modeGallery: 'Atlas',
      modePlanner: 'Planner',
      modeArchive: 'Archive',
      exitFullscreen: 'Exit Fullscreen',
      statsFmt: '{cities} cities · {spots} spots',
      filterTheme: 'Theme',
      filterWeather: 'Weather & Phenomena',
      filterAll: 'All',
      themeNature: 'Natural Wonders',
      themeArch: 'Architecture',
      weatherAllWeather: 'All-Season',
      weatherSunny: 'Clear & Stars',
      weatherRain: 'Mist & Clouds',
      weatherSnow: 'Snow & Ice',
      weatherSpecial: 'Extreme',
      matchFmt: '{count} matched',
      reset: 'Reset',
      clear: 'Clear',
      fitResults: 'Fit View',
      sidebarTitle: 'Destinations',
      legendAllWeather: 'All-Weather',
      legendSeasonal: 'Seasonal Peak',
      allYear: 'All',
      monthFmt: 'M{m}',
      citiesCountFmt: '{n}',
      spotsCountFmt: '{n} spots',
      skinSatellite: 'Satellite',
      skinNatgeo: 'NatGeo',
      skinPhysical: 'Terrain',
      skinDark: 'Night',
      layersTitle: 'Map Layers & Tools',
      layersMapStyle: 'Map Style',
      layersOverlays: 'Overlays',
      layerLabels: 'Base Labels',
      layerAllLabels: 'All Pins',
      layerCluster: 'Clustering',
      layerWeather: 'Live Radar',
      layerTimeMachine: 'Time Machine',
      layerFootprint: 'My Footprints',
      layerDiagnostics: 'Diagnostics',
      tileRouteAuto: 'Auto CDN',
      tileRouteCn: 'CN Fast',
      tileRouteGlobal: 'Global',
      tileRouteWorker: 'Edge CDN',
      flyChina: 'China',
      flyGlobal: 'Global',
      panorama: 'Overview',
      skipIntro: 'Skip Intro',
      tabSpots: 'Spots',
      tabPhoto: 'Sun & Light',
      tabMonths: 'Seasons',
      tabWeather: 'Weather',
      tabBudget: 'Budget',
      tabItinerary: 'Route',
      badgeAllWeather: 'All-Weather Gem',
      badgeSeasonal: 'Seasonal Peak',
      elevationPrefix: 'Elev',
      daysPrefix: 'Stay',
      flyToSpot: 'Fly Here',
      goldenHour: 'Golden Hour: ',
      realScene: 'Scene: ',
      weatherSunnyTitle: 'Clear Sky',
      weatherRainyTitle: 'Rain & Clearing Mist',
      weatherSnowyTitle: 'Snow & Winter',
      weatherSpecialTitle: 'Rare Phenomena',
      weatherTrigger: 'Trigger: ',
      weatherGear: 'Gear: ',
      budgetLuxury: 'Luxury Tier',
      budgetComfort: 'Comfort Tier',
      approxUsd: '≈ {usd} USD',
      hemiNorth: 'Northern Hemisphere',
      hemiSouth: 'Southern Hemisphere',
      monthArchiveFmt: '{m} Field Notes ({hemi})',
      recommendScore: 'Rating',
      tempRange: 'Daily Temp',
      climateFeature: 'Climate',
      monthHighlight: 'Highlights: ',
      provenanceTitle: 'Data Provenance · Atlas v2.0',
      provenanceNote: 'Coordinates, seasons & budgets curated from field notes. Check local access before travel.',
      galleryKicker: 'WORLD ATLAS · 722 DESTINATIONS',
      galleryTitle: 'Global Geographic Gallery',
      galleryLead: 'Curated across 722 destinations by natural wonders, architecture, all-weather beauty, and rare phenomena.',
      backToGlobe: 'Back to Globe',
      galAll: 'All',
      galFav: 'Saved',
      galIndex: 'Index Rank',
      destCountFmt: '{n} destinations',
      flyCoord: 'Fly to Pin',
      loadMore: 'Load more ({n} remaining)',
      emptyGallery: 'No destinations match this collection.',
      emptySidebar: 'No destinations match the active filters.',
      appearanceTitle: 'Appearance & Accent',
      modeNight: 'Dark',
      modeDay: 'Light',
      accentPaletteLabel: 'Theme Palette',
      customColorLabel: 'Custom Hex',
      languageTitle: 'Language',
      paletteSelect: 'Select',
      paletteLocate: 'Focus',
      paletteClose: 'Close',
      paletteAllCount: 'Instant search across {n} destinations',
      paletteHitsCount: '{n} results',
      paletteEmptyTitle: 'No matching cities, countries, or viewpoints.',
      paletteClearQuery: 'Clear Query',
      paletteRelaxFilters: 'Reset Filters',
      hoverAction: 'Explore {n} spots →',
      subspotToast: '{name} · {n} viewpoints',
      loaderText: 'Loading 722 destinations…',
      tourReplay: 'Quick Tour',
      tourWelcomeTitle: 'Explore the World',
      tourFeat1Title: '722 Destinations',
      tourFeat1Desc: '5,414 curated photo spots across 7 continents',
      tourFeat2Title: 'Seasons & SunLight',
      tourFeat2Desc: '12-month phenology & 3D solar azimuths',
      tourFeat3Title: 'Planner & Archive',
      tourFeat3Desc: 'Real road routing & private local footprints',
      tourStartBtn: 'Start Tour',
      tourSkipLater: 'Not Now',
      tourSkip: 'Skip',
      tourNext: 'Continue',
      tourFinish: 'Explore',
      tourStep1Title: 'Command Capsule',
      tourStep1Desc: 'Search, filter, save, and customize here.',
      tourLegList: 'List',
      tourLegSearch: 'Search ⌘K',
      tourLegFilter: 'Filter',
      tourLegFav: 'Saved',
      tourLegTheme: 'Theme',
      tourLegLang: 'Language',
      tourStep2Title: 'View Switcher',
      tourStep2Desc: 'Switch between Globe, Atlas, Planner & Archive.',
      tourStep3Title: 'Explore Pins',
      tourStep3Desc: 'Tap any pin for live weather, sun paths & spots.',
      tourLegGold: 'All-Season',
      tourLegIce: 'Seasonal',
      tourStep4Title: 'Season Timeline',
      tourStep4Desc: 'Filter the globe by your travel month.',
      tourStep5Title: 'Layers & Camera',
      tourStep5Desc: 'Open map overlays or reset your globe view.',
      tourLegLayers: 'Layers',
      tourLeg3d: '3D/2D',
      tourLegSpin: 'Spin',
      tourLegFull: 'Fullscreen',
      tourLegRegion: 'Focus',
      tourLegZoom: 'Zoom',
      continents: {
        global: 'World', asia: 'Asia', europe: 'Europe', oceania: 'Oceania',
        north_america: 'N. America', south_america: 'S. America', africa_antarctica: 'Africa/Ant.'
      },
      seasons: ['N.Winter', 'N.Spring', 'N.Summer', 'N.Autumn']
    }
  };

  let currentLang = 'zh-CN';
  const EXTRA_DICT = {
    refLink: {
      'zh-CN': '参考链接', 'zh-TW': '參考連結', en: 'Reference'
    },
    loadingDetail: {
      'zh-CN': '正在载入机位实操详情…', 'zh-TW': '正在載入機位實操詳情…', en: 'Loading spot guide & practical tips…'
    },
    webglRecovery: {
      'zh-CN': '图形上下文正在恢复，地球将自动重绘…', 'zh-TW': '圖形上下文正在恢復，地球將自動重繪…',
      en: 'Restoring graphics context, globe will redraw automatically…'
    }
  };
  const langMaps = new Map();
  const indexPromises = new Map();
  const regionPromises = new Map();

  function getLangMap(langId) {
    if (!langMaps.has(langId)) langMaps.set(langId, new Map());
    return langMaps.get(langId);
  }

  function mergeDict(langId, obj) {
    if (!obj || typeof obj !== 'object') return;
    const m = getLangMap(langId);
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (obj[k]) m.set(k, obj[k]);
    }
  }

  function getRegionIdx(destOrIdx) {
    if (typeof destOrIdx === 'number') return destOrIdx;
    if (!destOrIdx || typeof destOrIdx !== 'object') return -1;
    if (destOrIdx._r !== undefined && destOrIdx._r !== null) return Number(destOrIdx._r);
    const order = global.TRAVEL_ATLAS && global.TRAVEL_ATLAS.REGION_ORDER;
    if (Array.isArray(order)) {
      const idx = order.indexOf(destOrIdx.region);
      return idx >= 0 ? idx : order.length;
    }
    return -1;
  }

  function ensureLangIndex(langId) {
    const lang = langId || currentLang;
    if (!lang || lang === 'zh-CN' || lang === 'zh-TW') return Promise.resolve();
    if (!indexPromises.has(lang)) {
      const p = fetch(`data/i18n/${lang}/index.json`)
        .then((res) => (res.ok ? res.json() : null))
        .then((obj) => {
          mergeDict(lang, obj);
        })
        .catch(() => {});
      indexPromises.set(lang, p);
    }
    return indexPromises.get(lang);
  }

  function ensureRegionLang(langId, destOrIdx) {
    const lang = langId || currentLang;
    if (!lang || lang === 'zh-CN' || lang === 'zh-TW') return Promise.resolve();
    const rIdx = getRegionIdx(destOrIdx);
    if (rIdx < 0) return ensureLangIndex(lang);
    const key = `${lang}:${rIdx}`;
    if (!regionPromises.has(key)) {
      const p = ensureLangIndex(lang).then(() =>
        fetch(`data/i18n/${lang}/r${rIdx}.json`)
          .then((res) => (res.ok ? res.json() : null))
          .then((obj) => {
            mergeDict(lang, obj);
          })
          .catch(() => {})
      );
      regionPromises.set(key, p);
    }
    return regionPromises.get(key);
  }

  function loadInitialLang() {
    try {
      const params = new URLSearchParams(global.location.search);
      const qLang = params.get('lang');
      if (qLang && DICT[qLang]) {
        currentLang = qLang;
        return currentLang;
      }
      const saved = global.localStorage.getItem(LANG_KEY);
      if (saved && DICT[saved]) {
        currentLang = saved;
      }
    } catch (e) {
      // ignore
    }
    return currentLang;
  }

  function setLang(langId) {
    if (!DICT[langId]) return;
    currentLang = langId;
    try {
      global.localStorage.setItem(LANG_KEY, langId);
    } catch (e) {
      // ignore
    }
    if (document.documentElement) {
      document.documentElement.lang = langId;
    }
    hydrateStaticDom();
  }

  function getLang() {
    return currentLang;
  }

  function getLangMeta(id) {
    return LANGUAGES.find((l) => l.id === (id || currentLang)) || LANGUAGES[0];
  }

  function t(key, vars) {
    if (EXTRA_DICT[key]) {
      return EXTRA_DICT[key][currentLang] || EXTRA_DICT[key]['zh-CN'];
    }
    const pack = DICT[currentLang] || DICT['zh-CN'];
    let val = pack[key];
    if (val === undefined) val = DICT['zh-CN'][key] || key;
    if (typeof val === 'string' && vars) {
      Object.keys(vars).forEach((k) => {
        val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
      });
    }
    return val;
  }

  function tx(str) {
    if (!str) return '';
    if (currentLang === 'zh-TW') return toTraditional(str);
    if (currentLang === 'zh-CN') return str;
    const m = langMaps.get(currentLang);
    if (m) {
      const hit = m.get(str);
      if (hit !== undefined) return hit;
    }
    return str;
  }

  function tContinent(id) {
    const pack = DICT[currentLang] || DICT['zh-CN'];
    return (pack.continents && pack.continents[id]) || id;
  }

  function tSeason(monthNum) {
    const pack = DICT[currentLang] || DICT['zh-CN'];
    const s = pack.seasons || DICT['zh-CN'].seasons;
    if (monthNum >= 3 && monthNum <= 5) return s[1];
    if (monthNum >= 6 && monthNum <= 8) return s[2];
    if (monthNum >= 9 && monthNum <= 11) return s[3];
    return s[0];
  }

  function hydrateStaticDom() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.getAttribute('data-i18n');
      if (k) el.textContent = t(k);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const k = el.getAttribute('data-i18n-placeholder');
      if (k) el.setAttribute('placeholder', t(k));
    });
    const codeBadge = document.getElementById('lang-code-badge');
    if (codeBadge) codeBadge.textContent = getLangMeta(currentLang).code;
  }

  loadInitialLang();

  global.AppI18n = {
    LANGUAGES,
    getLang,
    setLang,
    getLangMeta,
    t,
    tx,
    tContinent,
    tSeason,
    hydrateStaticDom,
    toTraditional,
    ensureLangIndex,
    ensureRegionLang
  };
})(window);
