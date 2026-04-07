import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip, ResponsiveContainer, Treemap, Cell, LineChart, Line } from "recharts";
import * as d3 from "d3";

//  DESIGN TOKENS 
const C = {
  bg: "#F7F5F0",
  card: "#FFFFFF",
  sage: "#8BAF8E",
  sageLt: "#D4E6D5",
  blue: "#6B93B8",
  blueLt: "#D0E4F5",
  coral: "#D97B5A",
  coralLt: "#FAE0D5",
  gold: "#C9A84C",
  goldLt: "#F5EDD0",
  ocean: "#C8DDE8",
  land: "#E8E2D5",
  landDark: "#D4CCB8",
  charcoal: "#2C3030",
  mid: "#6B7280",
  light: "#9CA3AF",
  border: "#E5E0D5",
  region: {
    americas: "#8BAF8E",
    europe: "#6B93B8",
    asia: "#D97B5A",
    oceania: "#C9A84C",
    africa: "#9B7BB8",
    mideast: "#B8956B",
  }
};

//  FONTS 
const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: ${C.bg}; color: ${C.charcoal}; }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
  .serif { font-family: 'DM Serif Display', serif; }
  .mono { font-family: 'SFMono-Regular', 'Consolas', monospace; }
  .card { background: ${C.card}; border-radius: 10px; border: 1px solid ${C.border}; }
  .card-hover { transition: transform 0.22s ease-out, box-shadow 0.22s ease-out; }
  .card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,0.08); }
  .row-hover { transition: background 0.15s ease-out; }
  .row-hover:hover { background: ${C.bg}; }
  .fade-in { animation: fadeIn 0.28s cubic-bezier(0.16,1,0.3,1) both; }
  .fade-in-fast { animation: fadeIn 0.18s ease-out both; }
  @keyframes fadeIn { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: none; } }
  @keyframes arcDraw {
    from { stroke-dashoffset: 1400; opacity: 0; }
    to   { stroke-dashoffset: 0;    opacity: 1; }
  }
  @keyframes tooltipIn {
    from { opacity:0; transform: translateY(4px) scale(0.97); }
    to   { opacity:1; transform: none; }
  }
  @keyframes panelSlideIn {
    from { opacity:0; transform: translateX(12px); }
    to   { opacity:1; transform: none; }
  }
  @keyframes cardIn {
    from { opacity:0; transform: translateY(10px); }
    to   { opacity:1; transform: none; }
  }
  .tab-active { background: ${C.charcoal}; color: white; box-shadow: 0 2px 8px rgba(44,48,48,0.18); }
  .tab-inactive { background: transparent; color: ${C.mid}; }
  .tab-inactive:hover { background: ${C.border}; color: ${C.charcoal}; }
  .panel-anim { animation: panelSlideIn 0.3s cubic-bezier(0.16,1,0.3,1) both; }
  .tab-content { animation: fadeIn 0.25s cubic-bezier(0.16,1,0.3,1) both; }
  input:focus { border-color: ${C.blue} !important; box-shadow: 0 0 0 3px ${C.blueLt}; transition: box-shadow 0.2s; }
`;


//  MAP DIMENSIONS 
const MAP_W = 900, MAP_H = 460;

// Natural Earth projection — defined once at module level so toXY is consistent everywhere
const projection = d3.geoNaturalEarth1()
  .fitSize([MAP_W, MAP_H], { type: "Sphere" });

const toXY = (lat, lon) => {
  const pt = projection([lon, lat]);
  return pt ? { x: pt[0], y: pt[1] } : { x: 0, y: 0 };
};

const geoPathGen = d3.geoPath().projection(projection);

// ISO 3166-1 numeric → our country key
const NUMERIC_ID_MAP = {
  840:"USA", 156:"CHN", 276:"DEU", 392:"JPN", 410:"KOR",
  704:"VNM", 356:"IND", 124:"CAN",  36:"AUS",  76:"BRA",
  484:"MEX", 826:"GBR", 250:"FRA", 528:"NLD", 702:"SGP",
  158:"TWN", 682:"SAU", 643:"RUS", 360:"IDN", 764:"THA",
  792:"TUR", 710:"ZAF",
};

// Default full-world viewBox
const FULL_VB = { x: 0, y: 0, w: MAP_W, h: MAP_H };

// Compute zoom target: center on country, include nearby partners
const computeZoomTarget = (countryId, arcs, positions) => {
  const pos = positions[countryId];
  if (!pos) return FULL_VB;
  const aspect = MAP_W / MAP_H;
  const allPartners = arcs
    .map(a => a.from === countryId ? positions[a.to] : positions[a.from])
    .filter(Boolean);
  // Only include partners within ~280px to avoid zooming out to show trans-ocean arcs
  const nearPts = [pos, ...allPartners.filter(p =>
    Math.sqrt((p.x-pos.x)**2 + (p.y-pos.y)**2) < 290
  )];
  const xs = nearPts.map(p => p.x), ys = nearPts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const padX = 90, padY = 72;
  let zw = Math.max(MAP_W * 0.38, maxX - minX + padX * 2);
  let zh = zw / aspect;
  if ((maxY - minY + padY * 2) > zh) { zh = maxY - minY + padY * 2; zw = zh * aspect; }
  zw = Math.min(MAP_W * 0.78, zw);
  zh = zw / aspect;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const x = Math.max(0, Math.min(MAP_W - zw, cx - zw / 2));
  const y = Math.max(0, Math.min(MAP_H - zh, cy - zh / 2));
  return { x, y, w: zw, h: zh };
};

//  MACRO DATA 
const MACRO = [
  { label: "Fed Rate", value: "5.25%", delta: "+525bps YoY" },
  { label: "ECB Rate", value: "4.50%", delta: "+450bps YoY" },
  { label: "BOK Rate", value: "3.50%", delta: "+250bps YoY" },
  { label: "BOJ Rate", value: "0.10%", delta: "+10bps YoY" },
  { label: "BOC Rate", value: "5.00%", delta: "+475bps YoY" },
  { label: "Brent", value: "$83.4", delta: "-2.1% MoM" },
  { label: "Gold", value: "$2,042", delta: "+14.2% YoY" },
  { label: "DXY", value: "104.2", delta: "+1.8% YoY" },
  { label: "US 10Y", value: "4.18%", delta: "+85bps YoY" },
];

//  COUNTRIES 
const COUNTRIES = {
  USA: { name: "United States", flag: "US", lat: 38, lon: -97, region: "americas",
    gdp: 27360, gdpPC: 80412, growth: 2.5, pop: 334, unemployment: 3.7, inflation: 3.4,
    ca: -905, fdi: 311, debt: 121, tradeBalance: -773,
    exports: 3052, imports: 3825,
    topExports: [["Refined Petroleum",163],["Aircraft",130],["Semiconductors",86],["Passenger Vehicles",70],["Medical Instruments",61],["Natural Gas",58],["Pharmaceutical Products",52],["Soybeans",46],["Crude Petroleum",39],["Integrated Circuits",35]],
    topImports: [["Crude Petroleum",237],["Broadcasting Equipment",163],["Passenger Vehicles",155],["Computers",128],["Phones",117],["Vehicle Parts",97],["Pharmaceuticals",93],["Refined Petroleum",76],["Medical Instruments",59],["Semiconductors",57]],
    exportPartners: [["CAN",355],["MEX",322],["CHN",148],["JPN",78],["GBR",70]],
    importPartners: [["CHN",427],["MEX",475],["CAN",440],["DEU",163],["JPN",148]],
    summary: "The world's largest economy at $27.4T, the US combines a vast domestic market, reserve-currency status, and technological leadership. Its trade deficit of $773B reflects persistent consumption-investment gaps and dollar strength. The services sector—healthcare, finance, technology—generates surpluses that partially offset goods deficits, while semiconductor and aerospace exports anchor industrial competitiveness." },

  CHN: { name: "China", flag: "CN", lat: 35, lon: 105, region: "asia",
    gdp: 17700, gdpPC: 12620, growth: 5.2, pop: 1412, unemployment: 5.2, inflation: 0.2,
    ca: 253, fdi: 163, debt: 77, tradeBalance: 823,
    exports: 3380, imports: 2557,
    topExports: [["Broadcasting Equipment",240],["Integrated Circuits",182],["Computers",147],["Telephones",125],["Solar Panels",73],["Steel",68],["Refined Petroleum",64],["Furniture",56],["Ships",49],["Plastics",44]],
    topImports: [["Integrated Circuits",349],["Crude Petroleum",292],["Iron Ore",121],["Soybeans",61],["Natural Gas",59],["Coal",58],["Copper",55],["Vehicle Parts",50],["Passenger Vehicles",47],["Pharmaceuticals",38]],
    exportPartners: [["USA",500],["HKG",280],["JPN",165],["KOR",140],["DEU",113]],
    importPartners: [["KOR",180],["JPN",160],["USA",148],["TWN",215],["AUS",114]],
    summary: "China's $17.7T economy, the world's second largest, is underpinned by manufacturing dominance and an $823B trade surplus. The Belt and Road Initiative extended China's economic influence to 150+ countries. Structural headwinds—a property sector crisis, demographic aging, and Western decoupling pressures—have moderated growth from the double-digit rates of earlier decades, but China remains the world's largest exporter and manufacturer." },

  DEU: { name: "Germany", flag: "DE", lat: 51, lon: 10, region: "europe",
    gdp: 4456, gdpPC: 53369, growth: -0.3, pop: 84, unemployment: 3.0, inflation: 5.9,
    ca: 239, fdi: 36, debt: 66, tradeBalance: 212,
    exports: 1634, imports: 1422,
    topExports: [["Passenger Vehicles",224],["Vehicle Parts",65],["Pharmaceuticals",64],["Aircraft",44],["Broadcasting Equipment",40],["Industrial Machinery",39],["Medical Instruments",34],["Chemicals",32],["Plastics",28],["Refined Petroleum",26]],
    topImports: [["Natural Gas",62],["Crude Petroleum",60],["Passenger Vehicles",53],["Broadcasting Equipment",46],["Pharmaceuticals",44],["Vehicle Parts",40],["Integrated Circuits",38],["Computers",32],["Refined Petroleum",28],["Aircraft",26]],
    exportPartners: [["USA",157],["FRA",116],["NLD",112],["CHN",108],["POL",95]],
    importPartners: [["CHN",188],["NLD",120],["USA",96],["POL",86],["BEL",79]],
    summary: "Europe's largest economy built its prosperity on world-class engineering and export orientation—particularly the automotive sector. Germany faces an inflection point: dependency on Russian energy exposed industrial vulnerabilities, China's homegrown automakers challenge BMW and Volkswagen, and the country's debt-brake fiscal philosophy limits investment in infrastructure and digitalization. The 'Mittelstand' mid-sized industrial companies remain a unique competitive asset." },

  JPN: { name: "Japan", flag: "JP", lat: 36, lon: 138, region: "asia",
    gdp: 4213, gdpPC: 33834, growth: 1.9, pop: 125, unemployment: 2.5, inflation: 3.3,
    ca: 157, fdi: 32, debt: 255, tradeBalance: -65,
    exports: 714, imports: 779,
    topExports: [["Passenger Vehicles",106],["Vehicle Parts",47],["Industrial Machinery",40],["Integrated Circuits",27],["Broadcasting Equipment",26],["Ships",19],["Plastics",18],["Steel",17],["Robots",16],["Medical Instruments",15]],
    topImports: [["Crude Petroleum",97],["Natural Gas",82],["Broadcasting Equipment",28],["Integrated Circuits",26],["Coal",25],["Refined Petroleum",22],["Computers",19],["Pharmaceuticals",18],["Soybeans",12],["Vehicle Parts",11]],
    exportPartners: [["CHN",175],["USA",148],["KOR",46],["TWN",35],["HKG",29]],
    importPartners: [["CHN",206],["USA",84],["AUS",62],["SAU",54],["ARE",40]],
    summary: "Japan's $4.2T economy remains the world's fourth largest despite three decades of stagnation. The country punches above its weight in technology, robotics, and precision manufacturing. Extraordinary debt levels (255% of GDP) are sustainable only because they're predominantly domestically held. Abenomics stimulus, BOJ yield-curve control, and structural reforms under Kishida have catalysed a modest revival, with corporate governance improvements boosting equity markets." },

  KOR: { name: "South Korea", flag: "KR", lat: 37, lon: 127, region: "asia",
    gdp: 1709, gdpPC: 33147, growth: 1.4, pop: 52, unemployment: 2.8, inflation: 3.6,
    ca: 35, fdi: 17, debt: 50, tradeBalance: -10,
    exports: 632, imports: 642,
    topExports: [["Integrated Circuits",126],["Refined Petroleum",58],["Passenger Vehicles",51],["Batteries",30],["Ships",26],["Broadcasting Equipment",24],["Vehicle Parts",22],["Plastics",18],["Steel",16],["Medical Instruments",13]],
    topImports: [["Crude Petroleum",97],["Integrated Circuits",60],["Natural Gas",50],["Broadcasting Equipment",32],["Coal",22],["Refined Petroleum",21],["Computers",19],["Vehicle Parts",18],["Pharmaceuticals",14],["Iron Ore",12]],
    exportPartners: [["CHN",140],["USA",116],["VNM",61],["JPN",30],["HKG",28]],
    importPartners: [["CHN",180],["USA",61],["JPN",47],["SAU",42],["AUS",28]],
    summary: "South Korea transformed from one of the world's poorest countries in 1960 to a high-income technology powerhouse within a single generation. Samsung, SK Hynix, and TSMC-rival chipmakers make Korea a critical node in the global semiconductor supply chain. The economy's extreme export concentration (semiconductors alone = 20% of exports) creates vulnerability to tech cycles, while chaebols—family-run conglomerates—simultaneously enable scale and create governance risks." },

  VNM: { name: "Vietnam", flag: "VN", lat: 16, lon: 108, region: "asia",
    gdp: 433, gdpPC: 4316, growth: 5.1, pop: 98, unemployment: 2.3, inflation: 3.3,
    ca: 5, fdi: 18, debt: 37, tradeBalance: 23,
    exports: 355, imports: 332,
    topExports: [["Broadcasting Equipment",63],["Integrated Circuits",36],["Telephones",32],["Woven Clothing",26],["Knit Clothing",22],["Footwear",18],["Furniture",16],["Computers",14],["Coffee",4],["Rubber",3]],
    topImports: [["Integrated Circuits",63],["Broadcasting Equipment",48],["Refined Petroleum",24],["Computers",17],["Plastics",15],["Cotton",14],["Industrial Machinery",13],["Steel",12],["Vehicle Parts",11],["Soybeans",6]],
    exportPartners: [["USA",111],["CHN",61],["KOR",25],["JPN",24],["NLD",13]],
    importPartners: [["CHN",117],["KOR",61],["JPN",19],["SGP",14],["TWN",14]],
    summary: "Vietnam's export-led growth story is one of the most remarkable of the 21st century—exports have grown over 1,100% since 2000. Samsung's decision to move manufacturing from China to Vietnam in the 2010s transformed the country into a major electronics hub, with Samsung alone accounting for ~20% of Vietnam's total exports. Vietnam now competes directly with China as a manufacturing base for Western companies seeking supply chain diversification." },

  IND: { name: "India", flag: "IN", lat: 20, lon: 77, region: "asia",
    gdp: 3550, gdpPC: 2485, growth: 6.7, pop: 1429, unemployment: 7.8, inflation: 5.4,
    ca: -67, fdi: 70, debt: 83, tradeBalance: -245,
    exports: 776, imports: 898, // goods + services approx
    topExports: [["Refined Petroleum",80],["Pharmaceuticals",27],["Diamonds",23],["Packaged Medicines",19],["Motorcycles",10],["Rice",10],["Textiles",9],["Engineering Goods",8],["Iron & Steel",7],["Chemicals",7]],
    topImports: [["Crude Petroleum",132],["Gold",35],["Coal",28],["Electronics",22],["Diamonds",16],["Chemicals",15],["Industrial Machinery",14],["Vegetable Oils",12],["Fertilizers",11],["Iron & Steel",10]],
    exportPartners: [["USA",85],["ARE",27],["NLD",21],["CHN",17],["GBR",16]],
    importPartners: [["CHN",99],["ARE",42],["RUS",34],["USA",34],["SAU",34]],
    summary: "India's economy, now the world's fifth largest, is growing faster than any other major economy. Demographics are a key asset—India recently surpassed China as the world's most populous country and has the largest working-age population globally. IT services exports, pharmaceutical manufacturing, and a burgeoning startup ecosystem anchor the knowledge economy. Persistent infrastructure gaps, regulatory complexity, and agricultural dependency on monsoons remain structural constraints." },

  CAN: { name: "Canada", flag: "CA", lat: 60, lon: -95, region: "americas",
    gdp: 2140, gdpPC: 53834, growth: 1.2, pop: 40, unemployment: 5.8, inflation: 3.9,
    ca: -12, fdi: 53, debt: 107, tradeBalance: 34,
    exports: 588, imports: 554,
    topExports: [["Crude Petroleum",121],["Natural Gas",24],["Gold",22],["Passenger Vehicles",18],["Refined Petroleum",16],["Lumber",14],["Potash",12],["Canola Oil",10],["Aircraft",9],["Copper",8]],
    topImports: [["Passenger Vehicles",64],["Crude Petroleum",30],["Vehicle Parts",28],["Trucks",22],["Broadcasting Equipment",18],["Computers",15],["Aircraft",10],["Pharmaceuticals",10],["Refined Petroleum",10],["Fertilizers",8]],
    exportPartners: [["USA",480],["CHN",25],["GBR",19],["JPN",14],["NLD",11]],
    importPartners: [["USA",231],["CHN",72],["MEX",31],["DEU",16],["JPN",14]],
    summary: "Canada's economy is defined by its resource wealth—oil sands, minerals, forestry—and its deep integration with the United States. The USMCA agreement means ~77% of Canadian exports go to the US, creating extreme trade dependency but also frictionless access to the world's largest consumer market. A housing affordability crisis, driven by restrictive zoning and high immigration, has become the defining domestic economic challenge of the 2020s." },

  AUS: { name: "Australia", flag: "AU", lat: -28, lon: 135, region: "oceania",
    gdp: 1688, gdpPC: 64490, growth: 2.0, pop: 27, unemployment: 3.9, inflation: 5.4,
    ca: -16, fdi: 68, debt: 53, tradeBalance: 89,
    exports: 413, imports: 324,
    topExports: [["Iron Ore",118],["Coal",72],["Natural Gas",60],["Gold",24],["Wheat",11],["Beef",10],["Alumina",8],["Copper",6],["Lithium",5],["Wine",2]],
    topImports: [["Crude Petroleum",22],["Refined Petroleum",18],["Broadcasting Equipment",17],["Passenger Vehicles",16],["Computers",14],["Pharmaceuticals",12],["Aircraft",9],["Industrial Machinery",8],["Gold",7],["Medical Instruments",7]],
    exportPartners: [["CHN",120],["JPN",55],["KOR",29],["IND",21],["USA",15]],
    importPartners: [["CHN",72],["USA",38],["JPN",20],["KOR",17],["SGP",16]],
    summary: "Australia's resource-intensive economy has benefited enormously from China's industrialization—iron ore exports to China alone peaked at over $100B annually. The commodity supercycle boosted living standards but created a 'resource curse' dynamic that hollowed out manufacturing. Australia's lithium reserves are now strategically vital as EV battery demand accelerates, and the government is pushing to move up the value chain from raw material exports toward battery component manufacturing." },

  BRA: { name: "Brazil", flag: "BR", lat: -10, lon: -55, region: "americas",
    gdp: 2080, gdpPC: 9726, growth: 2.9, pop: 215, unemployment: 8.0, inflation: 4.6,
    ca: -31, fdi: 91, debt: 89, tradeBalance: 71,
    exports: 339, imports: 268,
    topExports: [["Soybeans",49],["Crude Petroleum",44],["Iron Ore",30],["Refined Petroleum",17],["Beef",15],["Sugar",12],["Coffee",8],["Corn",8],["Chicken",7],["Cellulose",6]],
    topImports: [["Refined Petroleum",21],["Fertilizers",16],["Industrial Machinery",14],["Pharmaceuticals",10],["Chemicals",9],["Electronics",9],["Cars",8],["Crude Petroleum",7],["Coal",6],["Plastics",6]],
    exportPartners: [["CHN",89],["USA",39],["ARG",14],["NLD",12],["DEU",9]],
    importPartners: [["CHN",52],["USA",39],["ARG",16],["DEU",11],["IND",8]],
    summary: "Brazil is Latin America's largest economy and an agricultural superpower—the world's largest exporter of soybeans, beef, sugar, and coffee. China has displaced the US as Brazil's largest trading partner, driven by commodity demand. Chronic governance challenges, infrastructure gaps, and the 'Brazil cost'—a combination of tax complexity, poor logistics, and high interest rates—have persistently capped growth below potential despite extraordinary natural endowments." },

  MEX: { name: "Mexico", flag: "MX", lat: 23, lon: -102, region: "americas",
    gdp: 1322, gdpPC: 10310, growth: 3.2, pop: 128, unemployment: 2.9, inflation: 5.5,
    ca: -9, fdi: 35, debt: 54, tradeBalance: 5,
    exports: 578, imports: 573,
    topExports: [["Passenger Vehicles",51],["Vehicle Parts",42],["Broadcasting Equipment",37],["Trucks",22],["Crude Petroleum",18],["Computers",15],["Medical Instruments",14],["Beer",5],["Avocados",3],["Tequila",3]],
    topImports: [["Vehicle Parts",52],["Broadcasting Equipment",48],["Refined Petroleum",38],["Industrial Machinery",26],["Computers",22],["Electronic Components",20],["Plastics",18],["Steel",14],["Iron Ore",9],["Pharmaceuticals",9]],
    exportPartners: [["USA",463],["CAN",18],["DEU",12],["CHN",11],["JPN",8]],
    importPartners: [["USA",233],["CHN",112],["DEU",17],["JPN",16],["KOR",14]],
    summary: "Mexico's manufacturing renaissance—nearshoring—is the economic story of the 2020s. US-China trade tensions and pandemic supply chain shocks are driving manufacturers to relocate to Mexico, which combines USMCA trade access, proximity to US consumers, and competitive labour costs. The automotive sector is a crown jewel, with Mexico ranking among the world's top 10 auto producers. The question is whether Mexico can capture more value-added manufacturing beyond assembly operations." },

  GBR: { name: "United Kingdom", flag: "GB", lat: 54, lon: -2, region: "europe",
    gdp: 3080, gdpPC: 45295, growth: 0.4, pop: 68, unemployment: 4.2, inflation: 6.7,
    ca: -100, fdi: 50, debt: 100, tradeBalance: -195,
    exports: 536, imports: 731,
    topExports: [["Gold",50],["Crude Petroleum",37],["Pharmaceutical Products",27],["Aircraft",22],["Refined Petroleum",21],["Passenger Vehicles",19],["Broadcasting Equipment",16],["Whisky",7],["Medical Instruments",7],["Financial Services",90]],
    topImports: [["Gold",48],["Crude Petroleum",42],["Broadcasting Equipment",38],["Passenger Vehicles",34],["Pharmaceuticals",31],["Natural Gas",24],["Computers",20],["Medical Instruments",18],["Aircraft",17],["Refined Petroleum",17]],
    exportPartners: [["USA",71],["DEU",38],["IRL",36],["NLD",31],["FRA",28]],
    importPartners: [["CHN",74],["USA",59],["DEU",58],["NLD",47],["FRA",28]],
    summary: "Post-Brexit Britain is navigating a complex readjustment—losing frictionless EU trade access while seeking new deals with the US, India, and Pacific nations. London's financial services dominance remains intact, but goods trade has structurally weakened. High inflation forced the BOE into aggressive rate hikes, squeezing mortgage holders in a country with unusually high floating-rate property debt. The productivity puzzle—consistently below G7 peers—remains unresolved." },

  FRA: { name: "France", flag: "FR", lat: 46, lon: 2, region: "europe",
    gdp: 3031, gdpPC: 44408, growth: 1.1, pop: 68, unemployment: 7.3, inflation: 5.7,
    ca: -24, fdi: 36, debt: 112, tradeBalance: -92,
    exports: 618, imports: 710,
    topExports: [["Aircraft",61],["Pharmaceutical Products",38],["Passenger Vehicles",19],["Refined Petroleum",18],["Luxury Goods",15],["Wines & Spirits",14],["Industrial Machinery",13],["Medical Instruments",12],["Nuclear Reactors",11],["Cosmetics",10]],
    topImports: [["Crude Petroleum",50],["Aircraft",36],["Pharmaceuticals",31],["Passenger Vehicles",30],["Natural Gas",26],["Broadcasting Equipment",21],["Computers",19],["Refined Petroleum",18],["Vehicle Parts",16],["Medical Instruments",14]],
    exportPartners: [["DEU",90],["USA",58],["ITA",46],["ESP",42],["BEL",39]],
    importPartners: [["DEU",100],["CHN",70],["BEL",46],["ITA",43],["NLD",42]],
    summary: "France's economy blends industrial power with unmatched luxury goods dominance. LVMH, Hermès, and Kering make France the world's luxury capital, while Airbus competes with Boeing for global aviation dominance. France operates Europe's largest nuclear fleet, giving it energy cost advantages. Structural rigidities in the labour market have kept unemployment persistently above the EU average, and Macron's reform agenda—particularly pension reform—has faced fierce social resistance." },

  NLD: { name: "Netherlands", flag: "NL", lat: 52, lon: 5, region: "europe",
    gdp: 1093, gdpPC: 61967, growth: 0.1, pop: 18, unemployment: 3.6, inflation: 4.1,
    ca: 97, fdi: 84, debt: 52, tradeBalance: 98,
    exports: 965, imports: 867,
    topExports: [["Refined Petroleum",75],["Broadcasting Equipment",65],["Computers",32],["Medical Instruments",22],["Pharmaceuticals",21],["EUV Lithography Machines",18],["Natural Gas",17],["Agricultural Products",16],["Chemicals",15],["Industrial Machinery",13]],
    topImports: [["Crude Petroleum",70],["Broadcasting Equipment",60],["Refined Petroleum",38],["Computers",30],["Pharmaceuticals",28],["Natural Gas",25],["Medical Instruments",20],["Industrial Machinery",18],["Chemicals",16],["Vehicle Parts",14]],
    exportPartners: [["DEU",186],["BEL",110],["FRA",84],["GBR",78],["USA",57]],
    importPartners: [["DEU",75],["BEL",56],["CHN",55],["USA",46],["GBR",42]],
    summary: "The Netherlands punches far above its weight in global trade—the Port of Rotterdam is Europe's largest, and the country serves as a critical logistics hub for the continent. The truly extraordinary story is ASML: the Dutch company holds a global monopoly on extreme ultraviolet (EUV) lithography machines, the equipment needed to manufacture advanced semiconductors. Without ASML machines, TSMC, Samsung, and Intel cannot produce chips. This makes the Netherlands a geopolitical pivot point in the US-China tech war." },

  SGP: { name: "Singapore", flag: "SG", lat: 1, lon: 104, region: "asia",
    gdp: 497, gdpPC: 88428, growth: 1.1, pop: 6, unemployment: 2.0, inflation: 4.8,
    ca: 87, fdi: 141, debt: 167, tradeBalance: 57,
    exports: 477, imports: 420,
    topExports: [["Refined Petroleum",71],["Integrated Circuits",62],["Computers",28],["Broadcasting Equipment",23],["Gold",18],["Pharmaceuticals",14],["Chemical Products",13],["Medical Instruments",10],["Pumps",8],["Turbines",7]],
    topImports: [["Crude Petroleum",76],["Integrated Circuits",58],["Refined Petroleum",35],["Computers",22],["Gold",20],["Broadcasting Equipment",19],["Pharmaceuticals",13],["Industrial Machinery",12],["Natural Gas",11],["Plastics",9]],
    exportPartners: [["CHN",68],["HKG",57],["MYS",40],["USA",35],["IND",27]],
    importPartners: [["CHN",60],["MYS",40],["USA",34],["JPN",22],["KOR",19]],
    summary: "Singapore's trade-to-GDP ratio exceeds 300%, making it the world's most trade-reliant major economy. The city-state transformed from a colonial entrepôt into a global financial, logistics, and biomedical hub within two generations—an economic miracle driven by governance quality, rule of law, and strategic positioning at the Strait of Malacca. Singapore hosts the Asian headquarters of thousands of multinationals and is now positioning itself as a hub for green finance and digital assets." },

  TWN: { name: "Taiwan", flag: "TW", lat: 24, lon: 121, region: "asia",
    gdp: 757, gdpPC: 32643, growth: 1.3, pop: 23, unemployment: 3.5, inflation: 2.5,
    ca: 55, fdi: 10, debt: 27, tradeBalance: 57,
    exports: 479, imports: 392,
    topExports: [["Integrated Circuits",156],["Broadcasting Equipment",22],["Computers",20],["Industrial Machinery",17],["Semiconductors",15],["Optical Equipment",12],["Plastics",11],["Printed Circuits",10],["Vehicle Parts",9],["Electronic Components",8]],
    topImports: [["Integrated Circuits",50],["Crude Petroleum",38],["Broadcasting Equipment",26],["Industrial Machinery",24],["Natural Gas",21],["Coal",17],["Aircraft",12],["Iron & Steel",11],["Electronic Components",10],["Computers",9]],
    exportPartners: [["CHN",84],["USA",78],["HKG",47],["JPN",28],["SGP",24]],
    importPartners: [["CHN",40],["USA",37],["JPN",32],["KOR",22],["AUS",13]],
    summary: "Taiwan's global importance far exceeds its political status. TSMC fabricates over 90% of the world's most advanced semiconductors (sub-5nm chips), making Taiwan the single most critical node in the global technology supply chain. An interruption of TSMC production—whether from military conflict, natural disaster, or geopolitical pressure—would cause a global economic shock dwarfing the 2020 auto-chip shortage. Taiwan Semiconductor Manufacturing Company is arguably the world's most strategically important company." },

  SAU: { name: "Saudi Arabia", flag: "SA", lat: 24, lon: 45, region: "mideast",
    gdp: 1069, gdpPC: 30436, growth: 0.9, pop: 36, unemployment: 5.8, inflation: 2.3,
    ca: 76, fdi: 24, debt: 24, tradeBalance: 108,
    exports: 379, imports: 271,
    topExports: [["Crude Petroleum",227],["Refined Petroleum",40],["Plastics",15],["Ethylene Polymers",12],["Propylene Polymers",9],["Methanol",8],["Chemical Products",7],["Fertilizers",6],["Aluminum",5],["Non-ferrous Metals",4]],
    topImports: [["Passenger Vehicles",17],["Broadcasting Equipment",15],["Computers",12],["Industrial Machinery",11],["Aircraft",10],["Gold",9],["Medical Instruments",8],["Pharmaceuticals",8],["Steel",7],["Electrical Equipment",7]],
    exportPartners: [["CHN",87],["IND",64],["JPN",42],["KOR",35],["USA",16]],
    importPartners: [["CHN",40],["USA",22],["IND",19],["DEU",17],["JPN",14]],
    summary: "Saudi Arabia's Vision 2030 program, led by Crown Prince MBS, represents the most ambitious economic transformation project in the Middle East—reducing oil dependency, building tourism and entertainment sectors, and developing a domestic industrial base. Saudi Aramco remains the world's most profitable company. OPEC+ production cuts have kept oil prices elevated to fund the transformation. The kingdom is deploying its sovereign wealth fund (PIF) aggressively into global sports, technology, and infrastructure investments." },

  RUS: { name: "Russia", flag: "RU", lat: 62, lon: 105, region: "europe",
    gdp: 1870, gdpPC: 12894, growth: 3.6, pop: 145, unemployment: 3.2, inflation: 7.4,
    ca: 50, fdi: -5, debt: 17, tradeBalance: 147,
    exports: 496, imports: 349,
    topExports: [["Crude Petroleum",123],["Refined Petroleum",78],["Natural Gas",29],["Coal",22],["Wheat",12],["Iron & Steel",12],["Aluminum",7],["Palladium",6],["Diamonds",5],["Fertilizers",14]],
    topImports: [["Passenger Vehicles",11],["Broadcasting Equipment",10],["Computers",9],["Pharmaceuticals",9],["Industrial Machinery",8],["Aircraft",7],["Vehicle Parts",7],["Chemicals",7],["Food",15],["Electronics",12]],
    exportPartners: [["CHN",111],["IND",55],["TUR",26],["DEU",14],["ITA",12]],
    importPartners: [["CHN",111],["DEU",14],["BLR",8],["TUR",8],["KOR",6]],
    summary: "Russia's economy, reshaped by Western sanctions following the 2022 Ukraine invasion, has proven more resilient than many forecast—war spending boosted GDP, and energy exports were rerouted to China, India, and Turkey. But structural damage is mounting: capital flight, brain drain, technology import restrictions, and the long-term costs of isolation from Western markets. Russia's pivot to China has deepened economic dependency on a partner that extracts favourable terms from this asymmetry." },

  IDN: { name: "Indonesia", flag: "ID", lat: -5, lon: 120, region: "asia",
    gdp: 1371, gdpPC: 4981, growth: 5.0, pop: 277, unemployment: 5.3, inflation: 3.7,
    ca: -8, fdi: 22, debt: 39, tradeBalance: 36,
    exports: 258, imports: 222,
    topExports: [["Coal",36],["Palm Oil",20],["Nickel",9],["Natural Gas",8],["Refined Petroleum",8],["Crude Petroleum",7],["Rubber",5],["Iron & Steel",4],["Coffee",4],["Copper",4]],
    topImports: [["Crude Petroleum",14],["Refined Petroleum",13],["Industrial Machinery",12],["Iron & Steel",10],["Broadcasting Equipment",9],["Computers",7],["Fertilizers",7],["Wheat",6],["Soybeans",5],["Chemicals",5]],
    exportPartners: [["CHN",67],["USA",23],["IND",21],["JPN",18],["MYS",14]],
    importPartners: [["CHN",71],["SGP",19],["JPN",16],["USA",13],["MYS",12]],
    summary: "Indonesia is the world's largest nickel producer, a strategic position as EV battery demand accelerates. The government's downstream industrialisation policy—banning raw nickel ore exports to force refining domestically—has attracted Chinese battery manufacturers and created a nascent stainless steel and battery supply chain. A Southeast Asian giant of 277 million people, Indonesia benefits from demographic dividends but needs sustained investment in education and infrastructure to avoid the middle-income trap." },

  THA: { name: "Thailand", flag: "TH", lat: 15, lon: 101, region: "asia",
    gdp: 512, gdpPC: 7297, growth: 1.9, pop: 70, unemployment: 1.0, inflation: 1.2,
    ca: -5, fdi: 11, debt: 62, tradeBalance: 6,
    exports: 288, imports: 282,
    topExports: [["Computers",17],["Passenger Vehicles",14],["Refined Petroleum",13],["Vehicle Parts",10],["Integrated Circuits",9],["Rubber",8],["Gold",7],["Natural Rubber",6],["Plastics",6],["Rice",5]],
    topImports: [["Crude Petroleum",20],["Broadcasting Equipment",18],["Integrated Circuits",15],["Industrial Machinery",12],["Gold",11],["Refined Petroleum",9],["Iron & Steel",8],["Computers",7],["Vehicle Parts",7],["Chemicals",6]],
    exportPartners: [["CHN",47],["USA",36],["JPN",25],["VNM",14],["AUS",13]],
    importPartners: [["CHN",65],["JPN",25],["USA",15],["MYS",14],["SGP",12]],
    summary: "Thailand earned the nickname 'Detroit of Southeast Asia' for its automotive manufacturing base—it's a top 10 global auto producer, dominated by Japanese brands. Hard disk drives, computers, and electronics have diversified the industrial mix. The country is now aggressively courting Chinese EV manufacturers (BYD, Great Wall) with substantial incentives, marking a strategic shift as Japanese automakers lag in EV transition. Tourism, heavily disrupted by COVID, has largely recovered and remains a critical foreign exchange earner." },

  TUR: { name: "Turkey", flag: "TR", lat: 39, lon: 35, region: "europe",
    gdp: 1107, gdpPC: 12948, growth: 4.5, pop: 85, unemployment: 9.4, inflation: 64.9,
    ca: -35, fdi: 10, debt: 33, tradeBalance: -98,
    exports: 255, imports: 353,
    topExports: [["Passenger Vehicles",12],["Gold",11],["Refined Petroleum",10],["Steel",9],["Vehicle Parts",8],["Chemicals",7],["Textiles",7],["Jewelry",6],["Packaged Medicines",5],["Household Equipment",4]],
    topImports: [["Gold",21],["Crude Petroleum",18],["Natural Gas",15],["Broadcasting Equipment",13],["Refined Petroleum",13],["Iron & Steel",12],["Chemicals",11],["Computers",9],["Industrial Machinery",8],["Pharmaceuticals",8]],
    exportPartners: [["DEU",18],["RUS",14],["GBR",12],["USA",11],["ITA",10]],
    importPartners: [["CHN",46],["RUS",44],["DEU",19],["USA",15],["ITA",13]],
    summary: "Turkey's economy is defined by tension between its strategic geographic position and institutional instability. Bridging Europe and Asia, Turkey plays a balancing act between NATO membership and Russian energy dependency. Erdoğan's unconventional policy of cutting rates to fight inflation created a currency crisis in 2021-22; the eventual orthodox reversal (rates to 42.5%) stabilised the lira. With Europe on its doorstep, Turkey is a major garment and automotive manufacturer, but sky-high inflation persistently erodes purchasing power and investor confidence." },

  ZAF: { name: "South Africa", flag: "ZA", lat: -29, lon: 25, region: "africa",
    gdp: 399, gdpPC: 6485, growth: 0.6, pop: 62, unemployment: 32.6, inflation: 6.0,
    ca: -2, fdi: 9, debt: 73, tradeBalance: 14,
    exports: 107, imports: 93,
    topExports: [["Gold",15],["Platinum",11],["Iron Ore",9],["Diamonds",7],["Coal",6],["Ferroalloys",5],["Palladium",4],["Iron & Steel",3],["Citrus",3],["Chromium",3]],
    topImports: [["Crude Petroleum",12],["Refined Petroleum",9],["Passenger Vehicles",5],["Broadcasting Equipment",4],["Computers",3],["Pharmaceuticals",3],["Industrial Machinery",3],["Iron & Steel",3],["Rice",2],["Fertilizers",2]],
    exportPartners: [["CHN",18],["DEU",7],["USA",6],["JPN",5],["IND",5]],
    importPartners: [["CHN",21],["DEU",7],["USA",6],["SAU",5],["IND",5]],
    summary: "South Africa is the continent's most industrialised economy but faces stark structural contradictions—world-class financial markets alongside 32.6% unemployment; abundant mineral wealth with electricity blackouts (load-shedding) crippling industrial output. The country holds dominant global positions in platinum group metals (palladium, rhodium) critical for catalytic converters and hydrogen fuel cells. ANC governance failures, state-owned enterprise dysfunction, and the legacy of apartheid spatial economics are the core structural impediments to growth." },
};

//  TRADE ARCS 
const TRADE_ARCS = [
  { from:"USA", to:"CHN", export:148, import:427, products:["Soybeans","Aircraft","Semiconductors"], importProducts:["Electronics","Phones","Computers"] },
  { from:"USA", to:"CAN", export:355, import:440, products:["Machinery","Vehicles","Oil"], importProducts:["Vehicles","Crude Oil","Lumber"] },
  { from:"USA", to:"MEX", export:322, import:475, products:["Electronics","Machinery","Plastics"], importProducts:["Vehicles","Electronics","Medical Devices"] },
  { from:"CHN", to:"KOR", export:140, import:180, products:["Electronics","Machinery","Plastics"], importProducts:["Semiconductors","Chemicals","Steel"] },
  { from:"CHN", to:"JPN", export:165, import:160, products:["Electronics","Machinery","Chemicals"], importProducts:["Vehicles","Machinery","Semiconductors"] },
  { from:"CHN", to:"AUS", export:58, import:114, products:["Electronics","Machinery","Chemicals"], importProducts:["Iron Ore","Coal","Gas"] },
  { from:"CHN", to:"DEU", export:108, import:188, products:["Electronics","Machinery","Textiles"], importProducts:["Vehicles","Machinery","Chemicals"] },
  { from:"CHN", to:"VNM", export:117, import:61, products:["Electronics Parts","Textiles","Steel"], importProducts:["Electronics","Textiles","Footwear"] },
  { from:"KOR", to:"VNM", export:61, import:25, products:["Semiconductors","Displays","Steel"], importProducts:["Electronics","Textiles","Footwear"] },
  { from:"KOR", to:"USA", export:116, import:61, products:["Semiconductors","Vehicles","Batteries"], importProducts:["Semiconductors","Aircraft","Machinery"] },
  { from:"JPN", to:"USA", export:148, import:84, products:["Vehicles","Machinery","Electronics"], importProducts:["Aircraft","Semiconductors","Machinery"] },
  { from:"DEU", to:"USA", export:157, import:96, products:["Vehicles","Machinery","Chemicals"], importProducts:["Aircraft","Semiconductors","Chemicals"] },
  { from:"DEU", to:"FRA", export:116, import:100, products:["Vehicles","Machinery","Chemicals"], importProducts:["Aircraft","Vehicles","Chemicals"] },
  { from:"DEU", to:"NLD", export:112, import:120, products:["Vehicles","Machinery","Chemicals"], importProducts:["Oil","Electronics","Chemicals"] },
  { from:"IND", to:"USA", export:85, import:34, products:["Pharmaceuticals","Textiles","IT Services"], importProducts:["Aircraft","Semiconductors","Machinery"] },
  { from:"IND", to:"CHN", export:17, import:99, products:["Iron Ore","Cotton","Chemicals"], importProducts:["Electronics","Machinery","Chemicals"] },
  { from:"SAU", to:"CHN", export:87, import:40, products:["Crude Oil","Refined Oil","Petrochemicals"], importProducts:["Electronics","Machinery","Vehicles"] },
  { from:"SAU", to:"IND", export:64, import:19, products:["Crude Oil","LPG","Petrochemicals"], importProducts:["Rice","Pharmaceuticals","Vehicles"] },
  { from:"AUS", to:"JPN", export:55, import:20, products:["Iron Ore","Coal","LNG"], importProducts:["Vehicles","Machinery","Electronics"] },
  { from:"BRA", to:"CHN", export:89, import:52, products:["Soybeans","Iron Ore","Crude Oil"], importProducts:["Electronics","Machinery","Chemicals"] },
  { from:"RUS", to:"CHN", export:111, import:111, products:["Crude Oil","Gas","Coal"], importProducts:["Electronics","Vehicles","Machinery"] },
  { from:"TWN", to:"CHN", export:84, import:40, products:["Semiconductors","Electronics","Machinery"], importProducts:["Electronics","Machinery","Chemicals"] },
  { from:"TWN", to:"USA", export:78, import:37, products:["Semiconductors","Electronics","Computers"], importProducts:["Aircraft","Semiconductors","Machinery"] },
  { from:"SGP", to:"CHN", export:68, import:60, products:["Electronics","Chemicals","Machinery"], importProducts:["Electronics","Machinery","Chemicals"] },
  { from:"IDN", to:"CHN", export:67, import:71, products:["Coal","Nickel","Palm Oil"], importProducts:["Electronics","Machinery","Chemicals"] },
];

//  COMMODITIES 
const COMMODITIES = [
  { id:"brent", name:"Brent Crude", unit:"$/bbl", price:83.4, yoy:-8.2, hi5y:139.1, lo5y:19.3,
    spark:[72,55,78,106,91,98,83], marketSize:2800,
    producers:[["Saudi Arabia","12%"],["Russia","11%"],["USA","18%"],["Iraq","5%"],["UAE","4%"]],
    consumers:[["USA","21%"],["China","16%"],["India","5%"],["Japan","4%"],["Russia","4%"]],
    insight:"US shale production made America the world's largest oil producer by 2018, fundamentally reshaping OPEC's pricing power. The IEA projects oil demand peaks before 2030 as EVs scale." },
  { id:"wti", name:"WTI Crude", unit:"$/bbl", price:77.8, yoy:-9.4, hi5y:130.5, lo5y:-37.6,
    spark:[60,50,74,101,85,92,78], marketSize:2600,
    producers:[["USA","20%"],["Canada","6%"],["Mexico","3%"],["Colombia","1%"],["Brazil","3%"]],
    consumers:[["USA","20%"],["Canada","4%"],["Mexico","2%"],["Latin America","3%"],["Europe","8%"]],
    insight:"WTI briefly went negative (-$37.63/bbl) in April 2020 as COVID lockdowns collapsed demand while storage capacity hit limits—a historic anomaly caused by financial contract mechanics." },
  { id:"natgas", name:"Natural Gas", unit:"$/MMBtu", price:2.4, yoy:-42.3, hi5y:10.0, lo5y:1.4,
    spark:[2.1,1.8,3.8,8.9,6.2,4.1,2.4], marketSize:800,
    producers:[["USA","24%"],["Russia","17%"],["Iran","7%"],["Qatar","6%"],["Canada","5%"]],
    consumers:[["USA","22%"],["Russia","11%"],["China","9%"],["Iran","6%"],["Japan","3%"]],
    insight:"Russia's Ukraine invasion caused a European gas crisis—prices hit $10 in 2022. Europe emergency-built LNG import terminals and diversified to US/Qatar LNG. Russian pipeline gas share in EU fell from 40% to under 10%." },
  { id:"gold", name:"Gold", unit:"$/oz", price:2042, yoy:14.2, hi5y:2135, lo5y:1470,
    spark:[1490,1731,1798,1826,1854,1940,2042], marketSize:13200,
    producers:[["China","11%"],["Russia","10%"],["Australia","10%"],["Canada","6%"],["USA","7%"]],
    consumers:[["India","25%"],["China","18%"],["USA","8%"],["Germany","5%"],["Turkey","4%"]],
    insight:"Central bank gold buying hit a 55-year high in 2022-23, driven by Russia, China, and emerging markets diversifying away from USD reserves following Russia's frozen assets precedent." },
  { id:"silver", name:"Silver", unit:"$/oz", price:23.4, yoy:2.8, hi5y:29.6, lo5y:12.1,
    spark:[17,26,24,22,21,23,23.4], marketSize:1400,
    producers:[["Mexico","23%"],["China","15%"],["Peru","14%"],["Chile","5%"],["Russia","5%"]],
    consumers:[["USA","13%"],["India","16%"],["China","15%"],["Japan","7%"],["Germany","5%"]],
    insight:"Silver's industrial demand now accounts for 60% of total demand, driven by solar panel manufacturing—each GW of solar capacity requires ~80 tonnes of silver. The energy transition is structurally bullish for silver." },
  { id:"copper", name:"Copper", unit:"$/t", price:8420, yoy:-4.1, hi5y:10730, lo5y:4618,
    spark:[5900,7800,9500,10200,8800,8600,8420], marketSize:2200,
    producers:[["Chile","27%"],["Peru","11%"],["China","9%"],["DRC","9%"],["USA","6%"]],
    consumers:[["China","55%"],["Europe","15%"],["USA","8%"],["Japan","4%"],["South Korea","3%"]],
    insight:"Goldman Sachs calls copper 'the new oil'—EVs use 3-4x more copper than combustion vehicles, and wind turbines require 15x more copper per MW than gas plants. Supply constraints loom as mine permitting takes 10-17 years." },
  { id:"wheat", name:"Wheat", unit:"$/bu", price:5.9, yoy:-21.3, hi5y:13.7, lo5y:4.6,
    spark:[5.0,6.5,7.8,12.9,8.4,7.5,5.9], marketSize:250,
    producers:[["China","17%"],["India","14%"],["Russia","12%"],["USA","7%"],["Canada","4%"]],
    consumers:[["Asia","42%"],["Europe","25%"],["Africa","20%"],["Americas","8%"],["Other","5%"]],
    insight:"Russia's Black Sea blockade of Ukrainian grain exports threatened food security across the Middle East and Africa in 2022—Ukraine and Russia together supply 30% of global wheat exports. The crisis spotlighted food supply chain vulnerabilities." },
  { id:"soybeans", name:"Soybeans", unit:"$/bu", price:13.2, yoy:-14.6, hi5y:17.6, lo5y:8.4,
    spark:[9.0,14.5,15.8,17.2,14.5,15.4,13.2], marketSize:200,
    producers:[["Brazil","38%"],["USA","32%"],["Argentina","12%"],["China","4%"],["India","3%"]],
    consumers:[["China","33%"],["USA","18%"],["Argentina","8%"],["Brazil","7%"],["EU","7%"]],
    insight:"China's soybean import dependency (33% of global demand) gives the US a potent trade lever—soybeans were a key bargaining chip in the 2018-19 US-China trade war, costing American farmers ~$25B in lost exports." },
  { id:"ironore", name:"Iron Ore", unit:"$/t", price:133, yoy:6.2, hi5y:230, lo5y:78,
    spark:[95,168,220,145,126,125,133], marketSize:280,
    producers:[["Australia","54%"],["Brazil","22%"],["China","7%"],["India","5%"],["Russia","4%"]],
    consumers:[["China","71%"],["Japan","5%"],["India","5%"],["South Korea","4%"],["Europe","6%"]],
    insight:"China consumes 71% of globally traded iron ore—its property sector alone drives ~40% of steel demand. China's property crisis and infrastructure slowdown have become the primary price driver for iron ore." },
  { id:"lithium", name:"Lithium", unit:"$/t", price:13500, yoy:-72.4, hi5y:84000, lo5y:6700,
    spark:[7000,8000,17000,71000,49000,25000,13500], marketSize:12,
    producers:[["Australia","47%"],["Chile","26%"],["China","15%"],["Argentina","9%"],["Brazil","2%"]],
    consumers:[["China","75%"],["South Korea","7%"],["Japan","5%"],["USA","4%"],["Other","9%"]],
    insight:"Lithium prices collapsed 72% in 2023 after a 10x spike driven by EV enthusiasm, as new Australian and South American supply came online faster than expected. Long-term structural demand from EV batteries remains intact." },
  { id:"uranium", name:"Uranium", unit:"$/lb", price:94.5, yoy:81.2, hi5y:94.5, lo5y:27,
    spark:[28,32,45,50,55,72,94.5], marketSize:28,
    producers:[["Kazakhstan","43%"],["Canada","15%"],["Namibia","11%"],["Australia","9%"],["Uzbekistan","7%"]],
    consumers:[["USA","29%"],["France","15%"],["China","12%"],["Russia","8%"],["South Korea","5%"]],
    insight:"Nuclear renaissance: uranium hit 17-year highs in 2024 as Europe's energy crisis revived interest in nuclear power. Physical uranium funds and AI data center power demand are creating structural demand that mine supply cannot quickly meet." },
  { id:"nickel", name:"Nickel", unit:"$/t", price:16800, yoy:-32.1, hi5y:101000, lo5y:11000,
    spark:[14000,18000,24000,95000,28000,24000,16800], marketSize:38,
    producers:[["Indonesia","49%"],["Philippines","10%"],["Russia","8%"],["Canada","7%"],["New Caledonia","5%"]],
    consumers:[["China","58%"],["Europe","14%"],["Japan","7%"],["South Korea","5%"],["USA","4%"]],
    insight:"Nickel hit $101,000/t in a March 2022 short squeeze before the LME suspended trading. Indonesia's downstream processing ban plus Chinese-financed HPAL plants flooded the market with battery-grade nickel, crushing prices from $48,000 to $16,000." },
  { id:"palladium", name:"Palladium", unit:"$/oz", price:1040, yoy:-38.2, hi5y:2875, lo5y:1040,
    spark:[2200,2360,2400,2100,1550,1680,1040], marketSize:18,
    producers:[["Russia","39%"],["South Africa","38%"],["Canada","10%"],["USA","6%"],["Zimbabwe","4%"]],
    consumers:[["Autocatalysts","84%"],["Electronics","6%"],["Dental","6%"],["Chemical","4%"]],
    insight:"Palladium's collapse mirrors the EV transition—84% of demand comes from gasoline engine catalytic converters. As EVs displace combustion engines, palladium demand structurally declines. Russia and South Africa control 77% of supply." },
  { id:"coffee", name:"Coffee (Arabica)", unit:"$/lb", price:1.95, yoy:22.6, hi5y:2.60, lo5y:0.95,
    spark:[1.05,1.25,2.30,2.15,1.60,1.59,1.95], marketSize:35,
    producers:[["Brazil","38%"],["Vietnam","16%"],["Colombia","8%"],["Indonesia","6%"],["Honduras","4%"]],
    consumers:[["USA","15%"],["Brazil","13%"],["Germany","8%"],["Japan","6%"],["Italy","5%"]],
    insight:"Climate change is the coffee industry's existential threat—suitable growing areas are projected to shrink 50% by 2050 at current warming trajectories. Brazil frosts and Vietnam droughts have triggered price spikes and farmer adaptation crises." },
  { id:"cotton", name:"Cotton", unit:"$/lb", price:0.83, yoy:-12.3, hi5y:1.57, lo5y:0.55,
    spark:[0.60,0.85,1.20,1.55,0.82,0.94,0.83], marketSize:85,
    producers:[["China","22%"],["India","20%"],["USA","14%"],["Brazil","11%"],["Pakistan","7%"]],
    consumers:[["China","29%"],["India","20%"],["Bangladesh","10%"],["Pakistan","7%"],["Turkey","4%"]],
    insight:"The Xinjiang cotton controversy—US import restrictions on Xinjiang cotton over forced labor concerns—is reshaping global apparel supply chains, accelerating sourcing shifts to Bangladesh, Vietnam, and India away from China-dependent networks." },
];

//  CURRENCIES 
const CURRENCIES = [
  { pair:"EUR/USD", rate:1.084, yoy:-3.1, hi5y:1.226, lo5y:0.953, spark:[1.12,1.22,1.13,0.97,1.07,1.09,1.084], regime:"Free Float" },
  { pair:"USD/JPY", rate:149.2, yoy:10.8, hi5y:151.9, lo5y:102.6, spark:[109,114,136,150,132,148,149.2], regime:"Managed Float" },
  { pair:"USD/KRW", rate:1324, yoy:4.2, hi5y:1445, lo5y:1105, spark:[1180,1190,1300,1440,1290,1320,1324], regime:"Managed Float" },
  { pair:"USD/CNY", rate:7.24, yoy:4.8, hi5y:7.35, lo5y:6.34, spark:[6.5,6.4,6.7,7.2,6.9,7.1,7.24], regime:"Managed Float" },
  { pair:"USD/CAD", rate:1.354, yoy:2.1, hi5y:1.461, lo5y:1.204, spark:[1.28,1.24,1.27,1.38,1.35,1.36,1.354], regime:"Free Float" },
  { pair:"GBP/USD", rate:1.267, yoy:-1.8, hi5y:1.428, lo5y:1.035, spark:[1.29,1.42,1.37,1.04,1.24,1.27,1.267], regime:"Free Float" },
  { pair:"USD/INR", rate:83.1, yoy:1.5, hi5y:84.5, lo5y:72.8, spark:[74,74,79,82,82,83,83.1], regime:"Managed Float" },
  { pair:"USD/CNH", rate:7.25, yoy:4.9, hi5y:7.36, lo5y:6.35, spark:[6.5,6.4,6.7,7.21,6.9,7.1,7.25], regime:"Pegged" },
];

const FX_RESERVES = [
  { country:"CN China", reserves:3170 },
  { country:"JP Japan", reserves:1234 },
  { country:"CH Switzerland", reserves:890 },
  { country:"IN India", reserves:606 },
  { country:"RU Russia", reserves:594 },
  { country:"TW Taiwan", reserves:562 },
  { country:"SA Saudi Arabia", reserves:437 },
  { country:"KR South Korea", reserves:413 },
  { country:"SG Singapore", reserves:361 },
  { country:"HK Hong Kong", reserves:434 },
];

//  SUPPLY CHAINS 
const SUPPLY_CHAINS = {
  smartphones: {
    name: "Smartphones", color: C.blue,
    steps: [
      { id:0, label:"Rare Earths Mining", detail:"Neodymium, dysprosium, and other REEs mined primarily in Inner Mongolia, China (60% of global supply). Used in vibration motors, speakers, and camera systems.", countries:["CHN","AUS"], lat:40, lon:110 },
      { id:1, label:"Semiconductor Fab", detail:"Advanced processors (A17 Pro, Snapdragon 8 Gen 3) fabricated by TSMC in Taiwan at 3nm process nodes. Samsung and SK Hynix produce DRAM and NAND flash in Korea.", countries:["TWN","KOR"], lat:30, lon:125 },
      { id:2, label:"Display Manufacturing", detail:"OLED displays produced by Samsung Display and LG Display in South Korea. BOE Technology in China supplies mid-range panels.", countries:["KOR","CHN"], lat:35, lon:125 },
      { id:3, label:"Component Assembly", detail:"Camera modules (Japan/China), batteries (China), touchscreens (Taiwan/China), PCBs (China/Taiwan) are assembled in regional supplier parks.", countries:["CHN","TWN","JPN"], lat:32, lon:118 },
      { id:4, label:"Final Assembly", detail:"Foxconn and Pegatron assemble 80%+ of iPhones in Zhengzhou, China. Vietnam (Samsung) and India (Apple/Foxconn) are growing assembly hubs.", countries:["CHN","VNM","IND"], lat:22, lon:108 },
      { id:5, label:"Consumer Markets", detail:"Shipped globally: USA (15%), China (25%), Europe (18%), India (10%), Rest of Asia (20%). Premium segment dominated by Apple; mid-range by Samsung and Chinese brands.", countries:["USA","CHN","DEU"], lat:38, lon:-30 },
    ],
    flows: [[0,1],[0,2],[1,3],[2,3],[3,4],[4,5]]
  },
  semiconductors: {
    name: "Semiconductors", color: C.sage,
    steps: [
      { id:0, label:"Silicon Wafers", detail:"Ultra-pure silicon (99.9999999%) sliced into wafers. Shin-Etsu (Japan) and Sumco (Japan) supply 55% of global wafers. Siltronic (Germany) is #3.", countries:["JPN","DEU"], lat:36, lon:138 },
      { id:1, label:"Chip Design", detail:"Fabless designers: Nvidia (USA), Qualcomm (USA), AMD (USA), Apple (USA), MediaTek (Taiwan), HiSilicon (China). IP licensed from ARM (UK/Japan).", countries:["USA","TWN"], lat:37, lon:-97 },
      { id:2, label:"EUV Lithography", detail:"ASML (Netherlands) manufactures 100% of extreme ultraviolet machines used to etch sub-7nm chips. Each machine costs $180M+; 1-year delivery lead times.", countries:["NLD"], lat:51, lon:5 },
      { id:3, label:"Advanced Fabrication", detail:"TSMC (Taiwan, 55% market share), Samsung Foundry (Korea, 17%), Intel Foundry (USA). Only TSMC and Samsung make leading-edge <3nm chips at scale.", countries:["TWN","KOR","USA"], lat:24, lon:121 },
      { id:4, label:"Advanced Packaging", detail:"CoWoS and HBM stacking by TSMC (Taiwan), ASE Group (Taiwan), Amkor (USA). Critical for AI chip performance—NVIDIA H100 uses 6x HBM3 stacks.", countries:["TWN","USA","KOR"], lat:25, lon:122 },
      { id:5, label:"Systems Integration", detail:"Data centers (Nvidia GPUs → Dell/HPE servers), consumer devices (Qualcomm SoCs → Android phones), automotive (Renesas/NXP → EVs).", countries:["USA","DEU","JPN"], lat:40, lon:-100 },
    ],
    flows: [[0,3],[1,3],[2,3],[3,4],[4,5],[0,4]]
  },
  evs: {
    name: "Electric Vehicles", color: C.sage,
    steps: [
      { id:0, label:"Lithium Mining", detail:"80% from Lithium Triangle (Argentina, Chile, Bolivia) and Australia. Hard rock spodumene (Australia) or brine extraction (South America). Prices collapsed 72% in 2023 on oversupply.", countries:["AUS","BRA"], lat:-25, lon:-65 },
      { id:1, label:"Nickel & Cobalt", detail:"Nickel primarily from Indonesia (49% global supply), processed into battery-grade material. Cobalt from DRC (70% supply)—a human rights flashpoint driving manufacturers toward nickel-rich, cobalt-free chemistries.", countries:["IDN"], lat:-3, lon:120 },
      { id:2, label:"Battery Cell Manufacturing", detail:"CATL (China, 37% global share), BYD (China), LG Energy Solution (Korea), Panasonic (Japan) dominate. China controls 75% of global battery manufacturing capacity.", countries:["CHN","KOR","JPN"], lat:28, lon:108 },
      { id:3, label:"Battery Pack Assembly", detail:"Cells assembled into packs with thermal management systems and BMS. Done primarily by automakers in-house or in joint ventures with cell makers.", countries:["CHN","DEU","USA"], lat:35, lon:100 },
      { id:4, label:"Vehicle Manufacturing", detail:"BYD (China, #1 globally), Tesla (USA), Volkswagen (Germany), Hyundai-Kia (Korea). China produces 60% of global EVs. Gigafactories in US, Germany, China, and growing in India.", countries:["CHN","USA","DEU"], lat:30, lon:100 },
      { id:5, label:"Charging Infrastructure", detail:"China has 60% of world's EV chargers. EU and US aggressively building out with government subsidies. Tesla Supercharger network became the North American standard.", countries:["CHN","USA","DEU"], lat:38, lon:-5 },
    ],
    flows: [[0,2],[1,2],[2,3],[3,4],[4,5]]
  },
  coffee: {
    name: "Coffee", color: C.coral,
    steps: [
      { id:0, label:"Growing", detail:"Arabica grown in high-altitude 'Coffee Belt' (23°N-25°S). Brazil (38%) and Colombia dominate Arabica. Vietnam (16%) is #2 overall, primarily Robusta for instant coffee.", countries:["BRA","VNM","IND"], lat:-5, lon:-45 },
      { id:1, label:"Wet/Dry Processing", detail:"Cherry → green bean: washed (Kenya, Colombia—clean/bright), natural (Ethiopia, Brazil—fruity), honey (Costa Rica—sweet). Processing defines 30-40% of cup flavor profile.", countries:["BRA","IND","IDN"], lat:0, lon:30 },
      { id:2, label:"Green Bean Trading", detail:"Most green coffee trades via commodity exchanges (ICE for Arabica, London for Robusta) or direct trade. Major trading houses: Volcafé, ECOM, Louis Dreyfus, Sucafina.", countries:["NLD","SGP"], lat:30, lon:25 },
      { id:3, label:"Roasting", detail:"JDE Peet's (Netherlands), Nestlé (Switzerland), Starbucks (USA), Lavazza (Italy) dominate. Roasting is highly localized as roasted beans stale within weeks vs. green beans' 1-2 year shelf life.", countries:["NLD","USA","DEU"], lat:48, lon:10 },
      { id:4, label:"Retail & Cafés", detail:"Starbucks (35,000 locations), Costa (UK, 4,000), Tim Hortons (Canada, 5,700). Specialty coffee's 3rd Wave revolution elevated quality standards globally. China's coffee market growing 15% annually.", countries:["USA","GBR","CHN"], lat:40, lon:-30 },
    ],
    flows: [[0,1],[1,2],[2,3],[3,4]]
  },
  crudeoil: {
    name: "Crude Oil", color: C.coral,
    steps: [
      { id:0, label:"Upstream Production", detail:"Major producers: Saudi Arabia (Aramco), Russia, USA (Permian Basin shale), UAE, Iraq, Kuwait. OPEC+ coordinates ~40% of global supply. US Permian alone produces 5.8M bbl/day.", countries:["SAU","RUS","USA"], lat:28, lon:50 },
      { id:1, label:"Pipelines & Terminals", detail:"Crude moves via 3 chokepoints: Strait of Hormuz (21M bbl/day, 20% of global supply), Strait of Malacca (16M bbl/day), Suez Canal (5.5M bbl/day). Disruption = instant price spike.", countries:["SAU","RUS"], lat:35, lon:60 },
      { id:2, label:"Maritime Transport", detail:"Tanker fleet controlled by Greek, Chinese, and Japanese operators. VLCC (Very Large Crude Carriers) move 2M barrels per trip. Shadow fleet circumvents Russia/Iran sanctions.", countries:["GBR","SGP","JPN"], lat:20, lon:75 },
      { id:3, label:"Refining", detail:"USA, China, Russia, India, Saudi Arabia are top refiners. Singapore is Asia's refining hub. Refinery configurations determine what products can be produced from each crude type.", countries:["USA","CHN","SGP"], lat:25, lon:100 },
      { id:4, label:"Petroleum Products", detail:"Gasoline (46%), diesel (26%), jet fuel (8%), petrochemicals (8%), fuel oil (12%) of typical refinery output. Petrochemicals feed plastics, fertilizers, synthetic fibers—everything.", countries:["USA","CHN","DEU"], lat:35, lon:-10 },
    ],
    flows: [[0,1],[1,2],[2,3],[3,4]]
  },
};

//  TRADE WAR SCENARIOS 
const TRADE_WAR_SCENARIOS = [
  {
    id:"us_china_electronics",
    title:"US US 25% Tariff on Chinese Electronics",
    subtitle:"Escalation of 2018-style tech tariffs",
    targetTrade: 163, tariff: 25,
    directImpact: "~$40B additional annual cost on US importers; ~$163B in affected electronics trade",
    gdpImpact: { country1: -0.15, country2: -0.30 },
    beneficiaries: [
      { country:"VN Vietnam", effect:"Electronics factories relocate; $15-25B trade diversion", delta:"+$18B" },
      { country:"MX Mexico", effect:"Nearshoring acceleration for consumer electronics", delta:"+$12B" },
      { country:"IN India", effect:"Apple/Foxconn manufacturing ramp-up", delta:"+$8B" },
      { country:"TW Taiwan", effect:"Some component manufacturing stays in Taiwan", delta:"+$4B" },
    ],
    hitSectors: ["Consumer Electronics","Solar Panels","Batteries","Telecom Equipment"],
    historicalNote:"The 2018-19 US-China trade war cost US consumers ~$57B/year in higher prices and US firms ~$1.7T in lost market cap. China retaliated on soybeans, costing US farmers $25B."
  },
  {
    id:"china_au_commodities",
    title:"CN China Commodity Import Restrictions on AU Australia",
    subtitle:"Similar to 2020 Australian barley/wine/coal bans",
    targetTrade: 114, tariff: 80,
    directImpact: "~$20B direct trade at risk; coal and barley most exposed",
    gdpImpact: { country1: -0.05, country2: -0.7 },
    beneficiaries: [
      { country:"ID Indonesia", effect:"Coal market share gain as China substitutes", delta:"+$6B" },
      { country:"RU Russia", effect:"Russian coal and barley fill the gap", delta:"+$5B" },
      { country:"CA Canada", effect:"Canola/barley alternative supplier", delta:"+$3B" },
      { country:"JP Japan", effect:"Australian coal/LNG redirected to Japan at discount", delta:"+$4B" },
    ],
    hitSectors: ["Coal","Barley","Wine","Timber","Beef"],
    historicalNote:"In 2020, China imposed 80% tariffs on Australian barley and banned beef from 4 major abattoirs. Australia diversified export markets and signed new deals with India and the EU—reducing China dependency from 40% to 28% of exports."
  },
  {
    id:"eu_us_auto",
    title:" EU 25% Tariff on US Automobiles",
    subtitle:"Retaliatory auto tariffs in trade dispute",
    targetTrade: 22, tariff: 25,
    directImpact: "~$5.5B additional cost on EU importers; US automakers lose pricing competitiveness",
    gdpImpact: { country1: -0.08, country2: -0.12 },
    beneficiaries: [
      { country:"DE Germany", effect:"BMW, Mercedes gain relative price advantage in EU market", delta:"+$3B" },
      { country:"KR South Korea", effect:"Hyundai/Kia gain market share in EU", delta:"+$2B" },
      { country:"JP Japan", effect:"Toyota, Honda gain EU market share", delta:"+$1.5B" },
    ],
    hitSectors: ["Passenger Vehicles","Trucks","Vehicle Parts","Automakers"],
    historicalNote:"Trump's 2018 threat of 25% auto tariffs on EU imports prompted EU to prepare a $294B retaliation list including US motorcycles (Harley-Davidson), bourbon, and agricultural products."
  },
  {
    id:"us_china_semis",
    title:"US US Semiconductor Export Controls on CN China",
    subtitle:"Extension of Oct 2022 chip export restrictions",
    targetTrade: 80, tariff: 0,
    directImpact: "~$80B in advanced chip-related trade restricted; China loses access to TSMC-fab chips, NVIDIA GPUs",
    gdpImpact: { country1: -0.05, country2: -0.8 },
    beneficiaries: [
      { country:"TW Taiwan", effect:"TSMC remains sole advanced fab; premium pricing for non-China orders", delta:"+$6B" },
      { country:"KR South Korea", effect:"Samsung and SK Hynix retain US market; some memory rerouted", delta:"+$4B" },
      { country:"JP Japan", effect:"Japanese fab equipment makers (Tokyo Electron, Advantest) face lost revenue", delta:"-$3B" },
    ],
    hitSectors:["Advanced Logic Chips","AI Accelerators","Memory","Fab Equipment","Cloud Infrastructure"],
    historicalNote:"October 2022 US export controls banned shipment of advanced chips and chipmaking equipment to China. NVIDIA estimated $400M quarterly revenue loss. China accelerated domestic semiconductor investment to $143B over 5 years."
  },
];

//  FACTS TICKER 
const FACTS = [
  "The Netherlands exports more goods than India despite being 80× smaller by population.",
  "Taiwan's TSMC fabricates 90%+ of the world's most advanced chips. No TSMC = no new iPhones, AI chips, or fighter jets.",
  "Singapore's trade-to-GDP ratio exceeds 300% — the world's most trade-dependent major economy.",
  "Vietnam's exports grew over 1,100% since 2000, driven by Samsung's manufacturing relocation from China.",
  "China processes 75% of the world's solar panels and 70% of its lithium batteries.",
  "The Strait of Hormuz handles 21M barrels of oil per day — 20% of global consumption.",
  "South Korea transformed from GDP per capita of $158 (1960) to $33,000 today — the fastest convergence in history.",
  "ASML (Netherlands) has a 100% monopoly on EUV lithography machines needed for advanced chips.",
  "Brazil and Vietnam supply 54% of the world's coffee. Climate change threatens to halve growing regions by 2050.",
  "China's foreign exchange reserves of $3.17 trillion are the world's largest — larger than #2-#10 combined.",
  "Germany's 'Mittelstand' — 3.5M family-run mid-sized firms — generates 50%+ of German GDP and 60% of employment.",
  "The container ship Ever Given blocked the Suez Canal for 6 days in 2021, disrupting $54B of trade per day.",
  "All 10 of the world's largest container ports are in Asia. Seven are in China.",
  "Saudi Aramco's 2022 net profit of $161B exceeded Apple's — on a single commodity.",
  "India surpassed China as the world's most populous country in April 2023.",
  "An EV requires 4× more copper than a combustion vehicle. Goldman Sachs calls copper 'the new oil.'",
  "Russia and South Africa control 77% of palladium supply — used in catalytic converters.",
  "Indonesia produces 49% of global nickel supply, the key ingredient in EV battery cathodes.",
  "China's trade surplus hit $823B in 2022 — the largest ever recorded by any country in history.",
  "The DRC holds 70% of the world's cobalt reserves, central to lithium-ion battery production.",
  "USMCA trade between the US, Canada, and Mexico totals ~$1.8T annually — the world's largest trading bloc by value.",
  "Japan's government debt of 255% of GDP is the highest in the world, yet remains financeable because 92% is domestically held.",
  "Australia exported more iron ore to China in 2022 than it did to the entire world in 2002.",
  "The iPhone contains components from 43 countries across 6 continents.",
  "Natural gas prices in Europe hit 10× their historical average in 2022 after Russia's Ukraine invasion.",
];

//  RANKINGS 
const RANKINGS = {
  gdp: [
    {r:1,flag:"US",country:"United States",val:27360,unit:"$B"},
    {r:2,flag:"CN",country:"China",val:17700,unit:"$B"},
    {r:3,flag:"DE",country:"Germany",val:4456,unit:"$B"},
    {r:4,flag:"JP",country:"Japan",val:4213,unit:"$B"},
    {r:5,flag:"IN",country:"India",val:3550,unit:"$B"},
    {r:6,flag:"GB",country:"United Kingdom",val:3080,unit:"$B"},
    {r:7,flag:"FR",country:"France",val:3031,unit:"$B"},
    {r:8,flag:"BR",country:"Brazil",val:2080,unit:"$B"},
    {r:9,flag:"IT",country:"Italy",val:2050,unit:"$B"},
    {r:10,flag:"CA",country:"Canada",val:2140,unit:"$B"},
  ],
  exporters: [
    {r:1,flag:"CN",country:"China",val:3380,unit:"$B"},
    {r:2,flag:"US",country:"United States",val:3052,unit:"$B"},
    {r:3,flag:"DE",country:"Germany",val:1634,unit:"$B"},
    {r:4,flag:"NL",country:"Netherlands",val:965,unit:"$B"},
    {r:5,flag:"JP",country:"Japan",val:714,unit:"$B"},
    {r:6,flag:"SG",country:"Singapore",val:477,unit:"$B"},
    {r:7,flag:"KR",country:"South Korea",val:632,unit:"$B"},
    {r:8,flag:"FR",country:"France",val:618,unit:"$B"},
    {r:9,flag:"MX",country:"Mexico",val:578,unit:"$B"},
    {r:10,flag:"CA",country:"Canada",val:588,unit:"$B"},
  ],
  surplus: [
    {r:1,flag:"CN",country:"China",val:823,unit:"$B"},
    {r:2,flag:"RU",country:"Russia",val:147,unit:"$B"},
    {r:3,flag:"SA",country:"Saudi Arabia",val:108,unit:"$B"},
    {r:4,flag:"DE",country:"Germany",val:212,unit:"$B"},
    {r:5,flag:"AU",country:"Australia",val:89,unit:"$B"},
    {r:6,flag:"NL",country:"Netherlands",val:98,unit:"$B"},
    {r:7,flag:"SG",country:"Singapore",val:57,unit:"$B"},
    {r:8,flag:"TW",country:"Taiwan",val:57,unit:"$B"},
    {r:9,flag:"BR",country:"Brazil",val:71,unit:"$B"},
    {r:10,flag:"ID",country:"Indonesia",val:36,unit:"$B"},
  ],
  deficit: [
    {r:1,flag:"US",country:"United States",val:-773,unit:"$B"},
    {r:2,flag:"GB",country:"United Kingdom",val:-195,unit:"$B"},
    {r:3,flag:"IN",country:"India",val:-245,unit:"$B"},
    {r:4,flag:"FR",country:"France",val:-92,unit:"$B"},
    {r:5,flag:"TR",country:"Turkey",val:-98,unit:"$B"},
    {r:6,flag:"CA",country:"Canada",val:-12,unit:"$B"},
    {r:7,flag:"JP",country:"Japan",val:-65,unit:"$B"},
    {r:8,flag:"KR",country:"South Korea",val:-10,unit:"$B"},
    {r:9,flag:"AR",country:"Argentina",val:-30,unit:"$B"},
    {r:10,flag:"BG",country:"Belgium",val:-20,unit:"$B"},
  ],
  growth: [
    {r:1,flag:"IN",country:"India",val:6.7,unit:"%"},
    {r:2,flag:"VN",country:"Vietnam",val:5.1,unit:"%"},
    {r:3,flag:"ID",country:"Indonesia",val:5.0,unit:"%"},
    {r:4,flag:"MX",country:"Mexico",val:3.2,unit:"%"},
    {r:5,flag:"RU",country:"Russia",val:3.6,unit:"%"},
    {r:6,flag:"SA",country:"Saudi Arabia (non-oil)",val:4.5,unit:"%"},
    {r:7,flag:"BR",country:"Brazil",val:2.9,unit:"%"},
    {r:8,flag:"US",country:"United States",val:2.5,unit:"%"},
    {r:9,flag:"CN",country:"China",val:5.2,unit:"%"},
    {r:10,flag:"AU",country:"Australia",val:2.0,unit:"%"},
  ],
};

//  SURPRISING STATS 
const SURPRISING_STATS = [
  { stat:"Netherlands vs India", detail:"The Netherlands ($1.1T GDP, 18M people) exports $965B of goods annually — more than India ($3.5T GDP, 1.4B people) at $776B. Rotterdam's port and re-export function explain the anomaly." },
  { stat:"Vietnam's Export Miracle", detail:"Vietnam's exports grew 1,100% from $15B in 2000 to $355B in 2022. Samsung's Vietnam factories alone account for ~20% of total Vietnamese exports." },
  { stat:"Singapore Trade-to-GDP 300%+", detail:"Singapore's trade volume exceeds 300% of its GDP — the world's highest ratio. Its position at the Strait of Malacca and role as re-export hub make it the world's most trade-reliant major economy." },
  { stat:"TSMC's Irreplaceability", detail:"TSMC fabricates over 90% of leading-edge chips (below 5nm). The company's market cap exceeded $500B in 2023. No other company can produce these chips at scale — not Intel, not Samsung." },
  { stat:"China's Trade Surplus Record", detail:"China's 2022 trade surplus of $823B is the largest ever recorded by any country in the history of trade statistics. It exceeds the combined GDP of many mid-sized economies." },
  { stat:"Japan's Domestic Debt", detail:"Japan's 255% debt-to-GDP ratio is the world's highest, yet Japan has never faced a debt crisis — because 92% of the debt is held domestically by Japanese households and institutions, making external default irrelevant." },
];

//  UTILITY FUNCTIONS 
const fmt = (n, decimals=0) => {
  if (n === undefined || n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${(n/1000).toFixed(1)}T`;
  if (abs >= 1) return `$${n.toFixed(decimals)}B`;
  return `$${n.toFixed(2)}B`;
};
const fmtNum = (n) => {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString();
};
const fmtPct = (n, showSign=true) => {
  if (n === undefined || n === null) return "—";
  const sign = showSign && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
};
const pctColor = (n) => n > 0 ? C.sage : C.coral;

//  BEZIER ARC 
const arcPath = (x1, y1, x2, y2, bend=0.3) => {
  const mx = (x1+x2)/2, my = (y1+y2)/2;
  const dx = x2-x1, dy = y2-y1;
  const dist = Math.sqrt(dx*dx+dy*dy);
  const cx = mx - dy*bend*(dist/MAP_W);
  const cy = my + dx*bend*(dist/MAP_W);
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState("map");
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const [secondCountry, setSecondCountry] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hoveredArc, setHoveredArc] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({x:0,y:0});
  const [selectedComm, setSelectedComm] = useState(null);
  const [commView, setCommView] = useState("cards");
  const [rankSort, setRankSort] = useState("gdp");
  const [selectedChain, setSelectedChain] = useState("smartphones");
  const [selectedScenario, setSelectedScenario] = useState(0);
  const [factIndex, setFactIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const svgRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setFactIndex(i => (i+1) % FACTS.length), 6000);
    return () => clearInterval(timer);
  }, []);

  const visibleArcs = useMemo(() => {
    if (!selectedCountry) return [];
    return TRADE_ARCS.filter(a =>
      a.from === selectedCountry || a.to === selectedCountry
    );
  }, [selectedCountry]);

  const handleCountryClick = useCallback((id) => {
    if (selectedCountry && id !== selectedCountry) {
      setSecondCountry(id);
    } else if (selectedCountry === id) {
      setSelectedCountry(null);
      setSecondCountry(null);
      setPanelOpen(false);
    } else {
      setSelectedCountry(id);
      setSecondCountry(null);
      setPanelOpen(true);
    }
  }, [selectedCountry]);

  const tabs = [
    { id:"map", label:"World Map" },
    { id:"commodities", label:"Commodities" },
    { id:"rankings", label:"Rankings" },
    { id:"supplychain", label:"Supply Chain" },
    { id:"tradewar", label:"Trade War" },
    { id:"currency", label:"Currency" },
  ];

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Inter',sans-serif"}}>
      <style>{STYLE}</style>

      {/* MACRO BAR */}
      <div style={{background:C.charcoal,color:"white",padding:"6px 16px",display:"flex",alignItems:"center",gap:16,overflowX:"auto",flexShrink:0}}>
        <span style={{fontFamily:"'DM Serif Display',serif",fontSize:13,color:C.gold,whiteSpace:"nowrap",marginRight:4}}>DK</span>
        {MACRO.map(m => (
          <div key={m.label} style={{display:"flex",gap:5,alignItems:"center",whiteSpace:"nowrap",fontSize:11}}>
            <span style={{color:"#9CA3AF"}}>{m.label}</span>
            <span style={{fontWeight:600}}>{m.value}</span>
            <span style={{color:m.delta.startsWith("+") ? "#6FCF97" : "#EB5757",fontSize:10}}>{m.delta}</span>
            <span style={{color:"#4B5563",marginLeft:6}}>|</span>
          </div>
        ))}
      </div>

      {/* HEADER */}
      <div style={{padding:"14px 20px 0",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div>
          <h1 style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:C.charcoal,letterSpacing:"-0.5px"}}>
            TradeScope
          </h1>
          <p style={{fontSize:11,color:C.light,marginTop:2}}>Global trade flows, commodities & macro data</p>
        </div>
        <input
          placeholder="Search country or commodity..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && searchQuery) {
              const cid = Object.keys(COUNTRIES).find(k =>
                COUNTRIES[k].name.toLowerCase().includes(searchQuery.toLowerCase())
              );
              if (cid) { setSelectedCountry(cid); setPanelOpen(true); setActiveTab("map"); }
              const comm = COMMODITIES.find(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
              if (comm) { setSelectedComm(comm.id); setActiveTab("commodities"); }
            }
          }}
          style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 12px",fontSize:12,width:220,background:"white",outline:"none",color:C.charcoal}}
        />
      </div>

      {/* TABS */}
      <div style={{padding:"10px 20px 0",display:"flex",gap:6,flexWrap:"wrap"}}>
        {tabs.map(t => (
          <button key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={activeTab===t.id ? "tab-active" : "tab-inactive"}
            style={{padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:500,transition:"all 0.2s ease-out"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* FACT TICKER */}
      <div style={{margin:"8px 20px",background:C.goldLt,borderRadius:8,padding:"6px 12px",overflow:"hidden",position:"relative",height:26}}>
        <div style={{position:"absolute",left:0,right:0,top:"50%",transform:"translateY(-50%)",padding:"0 12px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:10,fontWeight:700,color:C.gold,whiteSpace:"nowrap"}}>DID YOU KNOW</span>
          <span style={{fontSize:11,color:C.charcoal,transition:"all 0.5s",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {FACTS[factIndex]}
          </span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{padding:"0 20px 20px",position:"relative"}}>
        <div key={activeTab} className="tab-content">
        {activeTab === "map" && (
          <WorldMapView
            svgRef={svgRef}
            selectedCountry={selectedCountry}
            secondCountry={secondCountry}
            hoveredCountry={hoveredCountry}
            setHoveredCountry={setHoveredCountry}
            visibleArcs={visibleArcs}
            hoveredArc={hoveredArc}
            setHoveredArc={setHoveredArc}
            tooltipPos={tooltipPos}
            setTooltipPos={setTooltipPos}
            handleCountryClick={handleCountryClick}
            panelOpen={panelOpen}
            setPanelOpen={setPanelOpen}
            setSelectedCountry={setSelectedCountry}
            setSecondCountry={setSecondCountry}
          />
        )}
        {activeTab === "commodities" && (
          <CommoditiesView selectedComm={selectedComm} setSelectedComm={setSelectedComm} commView={commView} setCommView={setCommView} />
        )}
        {activeTab === "rankings" && (
          <RankingsView rankSort={rankSort} setRankSort={setRankSort} />
        )}
        {activeTab === "supplychain" && (
          <SupplyChainView selectedChain={selectedChain} setSelectedChain={setSelectedChain} />
        )}
        {activeTab === "tradewar" && (
          <TradeWarView selectedScenario={selectedScenario} setSelectedScenario={setSelectedScenario} />
        )}
        {activeTab === "currency" && <CurrencyView />}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{borderTop:`1px solid ${C.border}`,padding:"12px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:11,color:C.light}}>Data: World Bank · IMF · UN Comtrade · 2022/2023 estimates</span>
        <span style={{fontFamily:"'DM Serif Display',serif",fontSize:12,color:C.mid}}>TradeScope — Built by Danny Kwon</span>
      </div>
    </div>
  );
}

//  SPARKLINE 
function Sparkline({ data, color="#6B93B8", height=36, width=90 }) {
  if (!data || !data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v,i) => {
    const x = (i / (data.length-1)) * width;
    const y = height - ((v-min)/range) * height * 0.85 - 2;
    return `${x},${y}`;
  }).join(" ");
  const lastY = height - ((data[data.length-1]-min)/range)*height*0.85 - 2;
  return (
    <svg width={width} height={height} style={{overflow:"visible"}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={(data.length-1)/(data.length-1)*width} cy={lastY} r={2.5} fill={color}/>
    </svg>
  );
}

//  WORLD MAP VIEW 
function WorldMapView({ svgRef, selectedCountry, secondCountry, hoveredCountry, setHoveredCountry, visibleArcs, hoveredArc, setHoveredArc, tooltipPos, setTooltipPos, handleCountryClick, panelOpen, setPanelOpen, setSelectedCountry, setSecondCountry }) {
  const [geoFeatures, setGeoFeatures] = useState(null);
  const [graticule] = useState(() => d3.geoGraticule()());
  const [viewBox, setViewBox] = useState(FULL_VB);
  const vbRef = useRef(FULL_VB);
  const rafRef = useRef(null);
  const isZoomed = viewBox.w < MAP_W * 0.95;

  // Smooth viewBox animation
  const animateViewBox = useCallback((target) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const from = { ...vbRef.current };
    const start = performance.now();
    const dur = 650;
    const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
    const step = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const e = ease(t);
      const vb = {
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      };
      vbRef.current = vb;
      setViewBox(vb);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  // Zoom when country selected
  useEffect(() => {
    if (!selectedCountry) {
      animateViewBox(FULL_VB);
    } else {
      const target = computeZoomTarget(selectedCountry, visibleArcs, countryPositions);
      animateViewBox(target);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [selectedCountry, visibleArcs, animateViewBox]);

  // Load topojson + world-atlas from CDN
  useEffect(() => {
    const loadMap = async () => {
      try {
        if (!window.topojson) {
          await new Promise((res, rej) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js";
            s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
          });
        }
        const resp = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
        const topo = await resp.json();
        const fc = window.topojson.feature(topo, topo.objects.countries);
        setGeoFeatures(fc.features);
      } catch(e) { console.error("Map load failed", e); }
    };
    loadMap();
  }, []);

  const countryPositions = useMemo(() =>
    Object.fromEntries(Object.entries(COUNTRIES).map(([id, c]) => [id, toXY(c.lat, c.lon)])),
  []);

  const displayArcs = useMemo(() => {
    if (selectedCountry && secondCountry) {
      return visibleArcs.filter(a =>
        (a.from === selectedCountry && a.to === secondCountry) ||
        (a.from === secondCountry && a.to === selectedCountry)
      );
    }
    return visibleArcs;
  }, [visibleArcs, selectedCountry, secondCountry]);

  const activeCountryIds = useMemo(() =>
    new Set(displayArcs.flatMap(a => [a.from, a.to])),
  [displayArcs]);

  const vbStr = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

  return (
    <div style={{display:"flex",gap:16,marginTop:8}} className="fade-in">
      <div style={{flex:1,position:"relative"}}>
        <div style={{background:"#B8D4E3",borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`,position:"relative"}}>
          <svg ref={svgRef} viewBox={vbStr} style={{width:"100%",display:"block",transition:"none"}}>

            <path d={geoPathGen({type:"Sphere"})} fill="#B8D4E3"/>
            <path d={geoPathGen(graticule)} fill="none" stroke="white" strokeOpacity={0.15} strokeWidth={0.4}/>

            {/* Country fills */}
            {geoFeatures ? geoFeatures.map(feat => {
              const numId = parseInt(feat.id, 10);
              const ck = NUMERIC_ID_MAP[numId];
              const isSelected = ck === selectedCountry;
              const isSecond   = ck === secondCountry;
              const isHovered  = ck === hoveredCountry;
              const isActive   = ck && activeCountryIds.has(ck);
              const hasData    = !!ck;
              let fill = C.land;
              if (isSelected) fill = C.gold;
              else if (isSecond) fill = C.coral;
              else if (isHovered && hasData) fill = "#D0C9B6";
              else if (isActive) fill = "#DDD7C8";
              else if (hasData && selectedCountry) fill = "#E0DAC8";
              const pathD = geoPathGen(feat);
              if (!pathD) return null;
              return (
                <path key={feat.id} d={pathD} fill={fill}
                  stroke={C.landDark} strokeWidth={isSelected || isSecond ? 0.8 : 0.35}
                  style={{ cursor: hasData ? "pointer" : "default", transition: "fill 0.2s ease-out" }}
                  onClick={() => hasData && handleCountryClick(ck)}
                  onMouseEnter={() => hasData && setHoveredCountry(ck)}
                  onMouseLeave={() => setHoveredCountry(null)}/>
              );
            }) : (
              <g>
                <path d={geoPathGen({type:"Sphere"})} fill="#C8DDE8"/>
                <text x={MAP_W/2} y={MAP_H/2} textAnchor="middle" fontSize={14} fill={C.mid}>Loading map…</text>
              </g>
            )}

            <path d={geoPathGen({type:"Sphere"})} fill="none" stroke={C.landDark} strokeWidth={0.6}/>

            {/* Trade Arcs — keyed to selectedCountry so they re-animate on change */}
            <g key={`arcs-${selectedCountry}`}>
              {displayArcs.map((arc, i) => {
                const from = countryPositions[arc.from];
                const to   = countryPositions[arc.to];
                if (!from || !to) return null;
                const vol = arc.export + arc.import;
                const strokeW = Math.max(1.2, Math.min(4.5, vol / 90));
                const path  = arcPath(from.x, from.y, to.x, to.y);
                const path2 = arcPath(to.x, to.y, from.x, from.y, 0.2);
                const isHov = hoveredArc === i;
                const delay = `${i * 0.06}s`;
                const arcDur = Math.max(2.5, Math.min(5.5, 500 / vol));
                return (
                  <g key={i}>
                    <path d={path} fill="none" stroke={C.blue} strokeWidth={strokeW}
                      strokeLinecap="round" strokeDasharray="1400"
                      strokeOpacity={isHov ? 0.95 : 0.58}
                      style={{ animation: `arcDraw 0.65s cubic-bezier(0.16,1,0.3,1) ${delay} both`,
                               cursor:"pointer", transition:"stroke-opacity 0.2s" }}
                      onMouseEnter={e => { setHoveredArc(i); setTooltipPos({x:e.clientX,y:e.clientY}); }}
                      onMouseLeave={() => setHoveredArc(null)}/>
                    <path d={path2} fill="none" stroke={C.coral} strokeWidth={strokeW}
                      strokeLinecap="round" strokeDasharray="1400"
                      strokeOpacity={isHov ? 0.95 : 0.40}
                      style={{ animation: `arcDraw 0.65s cubic-bezier(0.16,1,0.3,1) ${delay} both`,
                               cursor:"pointer", transition:"stroke-opacity 0.2s" }}
                      onMouseEnter={e => { setHoveredArc(i); setTooltipPos({x:e.clientX,y:e.clientY}); }}
                      onMouseLeave={() => setHoveredArc(null)}/>
                    <AnimDot path={path}  color={C.blue}  dur={arcDur} begin={i*0.3}/>
                    <AnimDot path={path2} color={C.coral} dur={arcDur} begin={i*0.3 + arcDur/2}/>
                  </g>
                );
              })}
            </g>

            {/* Pin dots */}
            {Object.entries(COUNTRIES).map(([id, c]) => {
              const pos = countryPositions[id];
              if (!pos) return null;
              const isSel = id === selectedCountry, isSec = id === secondCountry;
              const isHov = id === hoveredCountry, isAct = activeCountryIds.has(id);
              if (!isSel && !isSec && !isHov && !isAct) return null;
              const r = isSel ? 7 : isSec ? 6 : isHov ? 5 : 4;
              const fill = isSel ? C.gold : isSec ? C.coral : C.region[c.region] || C.sage;
              return (
                <g key={"pin-"+id}>
                  <circle cx={pos.x} cy={pos.y} r={r+6} fill={fill} fillOpacity={0.15}/>
                  <circle cx={pos.x} cy={pos.y} r={r} fill={fill} stroke="white" strokeWidth={1.5}/>
                </g>
              );
            })}

            {/* Labels */}
            {Object.entries(COUNTRIES).map(([id, c]) => {
              const pos = countryPositions[id];
              if (!pos) return null;
              if (id !== selectedCountry && id !== secondCountry && id !== hoveredCountry) return null;
              return (
                <text key={"lbl-"+id} x={pos.x} y={pos.y-11} textAnchor="middle"
                  fontSize={9} fontWeight={700} fill={C.charcoal}
                  stroke="white" strokeWidth={2.5} paintOrder="stroke"
                  style={{pointerEvents:"none",userSelect:"none"}}>
                  {c.name}
                </text>
              );
            })}

            {/* Hit targets */}
            {Object.entries(COUNTRIES).map(([id]) => {
              const pos = countryPositions[id];
              if (!pos) return null;
              const SMALL = { SGP:22, NLD:18, TWN:18, KOR:16, VNM:16, GBR:16, DEU:16, FRA:16, ZAF:14 };
              const hitR = SMALL[id] || 13;
              const isHov = id === hoveredCountry;
              return (
                <circle key={"hit-"+id} cx={pos.x} cy={pos.y}
                  r={isHov ? hitR + 4 : hitR} fill="transparent"
                  stroke={isHov ? "rgba(255,255,255,0.28)" : "none"} strokeWidth={1}
                  style={{ cursor:"pointer" }}
                  onClick={() => handleCountryClick(id)}
                  onMouseEnter={() => setHoveredCountry(id)}
                  onMouseLeave={() => setHoveredCountry(null)}/>
              );
            })}

            {/* Legend */}
            <g transform={`translate(8,${MAP_H-28})`}>
              <rect width={160} height={22} rx={4} fill="white" fillOpacity={0.85}/>
              <circle cx={12} cy={11} r={4} fill={C.blue} fillOpacity={0.8}/>
              <text x={20} y={15} fontSize={8} fill={C.charcoal}>Exports</text>
              <circle cx={68} cy={11} r={4} fill={C.coral} fillOpacity={0.8}/>
              <text x={76} y={15} fontSize={8} fill={C.charcoal}>Imports</text>
              <text x={120} y={15} fontSize={7} fill={C.mid}>Click country</text>
            </g>
          </svg>

          {/* Zoom reset button */}
          {isZoomed && (
            <button onClick={() => { animateViewBox(FULL_VB); }}
              style={{
                position:"absolute", top:10, right:10,
                background:"rgba(255,255,255,0.92)", border:`1px solid ${C.border}`,
                borderRadius:7, padding:"5px 11px", fontSize:11, fontWeight:600,
                color:C.charcoal, cursor:"pointer",
                boxShadow:"0 2px 8px rgba(0,0,0,0.10)",
                transition:"all 0.18s ease-out",
                animation:"tooltipIn 0.2s ease-out both",
              }}>
              Reset View
            </button>
          )}

          {hoveredArc !== null && displayArcs[hoveredArc] && (
            <ArcTooltip arc={displayArcs[hoveredArc]} pos={tooltipPos}/>
          )}
        </div>

        {/* Country picker */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:7}}>
          <span style={{fontSize:11,color:C.mid,whiteSpace:"nowrap",fontWeight:500}}>Country:</span>
          <select value="" onChange={e => { if (e.target.value) handleCountryClick(e.target.value); }}
            style={{ flex:1, maxWidth:220, fontSize:11, padding:"5px 8px", borderRadius:7,
              border:`1px solid ${C.border}`, background:"white", color:C.charcoal, cursor:"pointer", outline:"none" }}>
            <option value="">— select from list —</option>
            {Object.entries(COUNTRIES).sort(([,a],[,b]) => a.name.localeCompare(b.name)).map(([id,c]) => (
              <option key={id} value={id}>
                {c.name}{id===selectedCountry?" (selected)":id===secondCountry?" (2nd)":""}
              </option>
            ))}
          </select>
          {selectedCountry && (
            <button onClick={() => { setSelectedCountry(null); setSecondCountry(null); setPanelOpen(false); }}
              style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7,
                padding:"4px 11px", color:C.coral, cursor:"pointer", fontSize:11, fontWeight:500, whiteSpace:"nowrap" }}>
              Clear
            </button>
          )}
        </div>

        {!selectedCountry && (
          <div style={{marginTop:5,fontSize:11,color:C.light}}>
            Click any country on the map or use the picker · Select two countries for bilateral analysis
          </div>
        )}
        {selectedCountry && (
          <div style={{fontSize:11,color:C.mid,marginTop:4,fontWeight:500}}>
            {COUNTRIES[selectedCountry]?.name} trade partners
            {secondCountry ? <span style={{color:C.coral}}> · Bilateral: {COUNTRIES[secondCountry]?.name}</span>
              : <span style={{color:C.light}}> · click a second country for bilateral view</span>}
          </div>
        )}
      </div>

      {/* COUNTRY PANEL */}
      <div style={{ width: panelOpen ? 320 : 0, overflow:"hidden", transition:"width 0.32s cubic-bezier(0.16,1,0.3,1)", flexShrink:0 }}>
        {panelOpen && selectedCountry && COUNTRIES[selectedCountry] && (
          <CountryPanel country={COUNTRIES[selectedCountry]} countryId={selectedCountry}
            onClose={() => { setPanelOpen(false); setSelectedCountry(null); setSecondCountry(null); }}
            secondCountry={secondCountry ? COUNTRIES[secondCountry] : null}
            secondId={secondCountry}/>
        )}
      </div>
    </div>
  );
}

//  ANIMATED DOT — pure CSS animateMotion, no JS tick needed
function AnimDot({ path, color, dur = 4, begin = 0 }) {
  return (
    <circle r={2.5} fill={color} fillOpacity={0.88}>
      <animateMotion
        path={path}
        dur={`${dur}s`}
        begin={`${begin}s`}
        repeatCount="indefinite"
        calcMode="linear"
        rotate="none"
      />
    </circle>
  );
}

//  ARC TOOLTIP 
function ArcTooltip({ arc, pos }) {
  const fromC = COUNTRIES[arc.from], toC = COUNTRIES[arc.to];
  if (!fromC || !toC) return null;
  return (
    <div style={{
      position:"fixed", left:pos.x+14, top:pos.y-12, zIndex:1000,
      background:"white", border:`1px solid ${C.border}`, borderRadius:12,
      padding:"11px 15px", boxShadow:"0 12px 32px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.06)",
      fontSize:11, minWidth:210, pointerEvents:"none",
      animation:"tooltipIn 0.16s cubic-bezier(0.16,1,0.3,1) both",
    }}>
      <div style={{fontFamily:"'DM Serif Display',serif",fontSize:13,marginBottom:8,color:C.charcoal}}>
        {fromC.name} {"–"} {toC.name}
      </div>
      <div style={{display:"flex",gap:14,marginBottom:8}}>
        <div style={{flex:1,borderRadius:7,background:C.blueLt,padding:"7px 9px"}}>
          <div style={{fontSize:9,fontWeight:700,color:C.blue,textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:2}}>
            {fromC.name.split(" ")[0]} exports
          </div>
          <div style={{fontSize:15,fontWeight:700,color:C.blue}}>${arc.export}B</div>
          <div style={{color:C.mid,fontSize:9,marginTop:2,lineHeight:1.4}}>{(arc.products||[]).join(", ")}</div>
        </div>
        <div style={{flex:1,borderRadius:7,background:C.coralLt,padding:"7px 9px"}}>
          <div style={{fontSize:9,fontWeight:700,color:C.coral,textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:2}}>
            {fromC.name.split(" ")[0]} imports
          </div>
          <div style={{fontSize:15,fontWeight:700,color:C.coral}}>${arc.import}B</div>
          <div style={{color:C.mid,fontSize:9,marginTop:2,lineHeight:1.4}}>{(arc.importProducts||[]).join(", ")}</div>
        </div>
      </div>
      <div style={{borderTop:`1px solid ${C.border}`,paddingTop:6,color:C.mid,fontSize:10,display:"flex",justifyContent:"space-between"}}>
        <span>Total bilateral</span>
        <strong style={{color:C.charcoal}}>${arc.export + arc.import}B</strong>
      </div>
    </div>
  );
}

//  COUNTRY PANEL 
function CountryPanel({ country, countryId, onClose, secondCountry, secondId }) {
  const [tab, setTab] = useState("profile");
  const c = country;
  return (
    <div className="card panel-anim" style={{height:"100%",overflowY:"auto",padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div>
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,letterSpacing:"-0.3px"}}>{c.name}</div>
          <div style={{fontSize:11,color:C.mid,marginTop:1}}>{c.region.charAt(0).toUpperCase()+c.region.slice(1)} · {c.flag}</div>
        </div>
        <button onClick={onClose}
          style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,cursor:"pointer",
            fontSize:12,color:C.mid,padding:"3px 8px",transition:"all 0.15s",lineHeight:1.2}}
          onMouseEnter={e => e.target.style.color=C.coral}
          onMouseLeave={e => e.target.style.color=C.mid}>
          Close
        </button>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:14}}>
        {["profile","trade","bilateral"].filter(t => t !== "bilateral" || secondCountry).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={tab===t ? "tab-active" : "tab-inactive"}
            style={{padding:"4px 11px",borderRadius:12,border:"none",cursor:"pointer",fontSize:10,fontWeight:500,transition:"all 0.18s"}}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div key="profile" className="fade-in-fast">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
            {[
              ["GDP", fmt(c.gdp)], ["GDP/Capita", `$${fmtNum(c.gdpPC)}`],
              ["Growth", fmtPct(c.growth)], ["Population", `${c.pop}M`],
              ["Unemployment", fmtPct(c.unemployment,false)], ["Inflation", fmtPct(c.inflation,false)],
              ["Current Acct", fmt(c.ca)], ["Debt/GDP", fmtPct(c.debt,false)],
            ].map(([label,val]) => (
              <div key={label} style={{background:C.bg,borderRadius:7,padding:"7px 9px"}}>
                <div style={{fontSize:9,color:C.light,textTransform:"uppercase",letterSpacing:"0.6px",fontWeight:500}}>{label}</div>
                <div style={{fontWeight:700,fontSize:13,color:C.charcoal,marginTop:2}}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:C.mid,marginBottom:5,fontWeight:500}}>
              Trade Balance: <span style={{color:c.tradeBalance>=0?C.sage:C.coral,fontWeight:700}}>{fmt(c.tradeBalance)}</span>
            </div>
            <div style={{display:"flex",gap:3,alignItems:"center",height:10,borderRadius:4,overflow:"hidden"}}>
              <div style={{flex:c.exports,background:C.blue,height:"100%"}}/>
              <div style={{flex:c.imports,background:C.coral,height:"100%"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.mid,marginTop:3}}>
              <span style={{color:C.blue,fontWeight:600}}>Exports ${c.exports}B</span>
              <span style={{color:C.coral,fontWeight:600}}>Imports ${c.imports}B</span>
            </div>
          </div>

          <div style={{background:C.blueLt,borderRadius:8,padding:"9px 11px",marginBottom:14}}>
            <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.6px",color:C.blue,marginBottom:5}}>Economic Snapshot</div>
            <p style={{fontSize:10,lineHeight:1.65,color:C.charcoal}}>{c.summary}</p>
          </div>

          <div>
            <div style={{fontSize:10,fontWeight:700,color:C.charcoal,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.4px"}}>Top Export Partners</div>
            {(c.exportPartners||[]).map(([id,val]) => (
              <div key={id} className="row-hover" style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"4px 3px",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.charcoal}}>{COUNTRIES[id]?.name || id}</span>
                <span style={{fontWeight:700,color:C.blue}}>${val}B</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "trade" && (
        <div key="trade" className="fade-in-fast">
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,color:C.charcoal,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.4px"}}>Top 10 Exports</div>
            {(c.topExports||[]).map(([prod,val],i) => (
              <div key={i} className="row-hover" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 3px",borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:10,flex:1,color:C.charcoal}}>{prod}</span>
                <div style={{width:48,height:4,background:C.border,borderRadius:2,margin:"0 7px"}}>
                  <div style={{width:`${(val/((c.topExports[0]||[0,1])[1]))*100}%`,height:"100%",background:C.blue,borderRadius:2}}/>
                </div>
                <span style={{fontSize:10,fontWeight:700,color:C.blue,width:44,textAlign:"right"}}>${val}B</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:C.charcoal,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.4px"}}>Top 10 Imports</div>
            {(c.topImports||[]).map(([prod,val],i) => (
              <div key={i} className="row-hover" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 3px",borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:10,flex:1,color:C.charcoal}}>{prod}</span>
                <div style={{width:48,height:4,background:C.border,borderRadius:2,margin:"0 7px"}}>
                  <div style={{width:`${(val/((c.topImports[0]||[0,1])[1]))*100}%`,height:"100%",background:C.coral,borderRadius:2}}/>
                </div>
                <span style={{fontSize:10,fontWeight:700,color:C.coral,width:44,textAlign:"right"}}>${val}B</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "bilateral" && secondCountry && (
        <div key="bilateral" className="fade-in-fast">
          <BilateralPanel c1={country} c1Id={countryId} c2={secondCountry} c2Id={secondId}/>
        </div>
      )}
    </div>
  );
}

//  BILATERAL PANEL 
function BilateralPanel({ c1, c1Id, c2, c2Id }) {
  const arc = TRADE_ARCS.find(a =>
    (a.from === c1Id && a.to === c2Id) || (a.from === c2Id && a.to === c1Id)
  );
  const isForward = arc?.from === c1Id;
  const c1Exports = isForward ? arc?.export : arc?.import;
  const c2Exports = isForward ? arc?.import : arc?.export;
  const c1Products = isForward ? arc?.products : arc?.importProducts;
  const c2Products = isForward ? arc?.importProducts : arc?.products;

  if (!arc) {
    return <div style={{fontSize:11,color:C.mid,padding:8}}>No direct trade arc data available for this pair. These countries may trade via intermediaries or have lower bilateral volumes.</div>;
  }

  const balance = (c1Exports||0) - (c2Exports||0);
  return (
    <div>
      <div style={{fontWeight:700,fontSize:12,marginBottom:8}}>
        {c1.flag} {c1.name.split(" ")[0]} {"<->"} {c2.flag} {c2.name.split(" ")[0]}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <div style={{background:C.blueLt,borderRadius:8,padding:8}}>
          <div style={{fontSize:9,color:C.blue,fontWeight:700,marginBottom:2}}>{c1.flag} {c1.name.split(" ")[0]} exports to {c2.name.split(" ")[0]}</div>
          <div style={{fontSize:18,fontWeight:700,color:C.blue}}>${c1Exports}B</div>
          <div style={{fontSize:9,color:C.mid,marginTop:3}}>{(c1Products||[]).join(" · ")}</div>
        </div>
        <div style={{background:C.coralLt,borderRadius:8,padding:8}}>
          <div style={{fontSize:9,color:C.coral,fontWeight:700,marginBottom:2}}>{c2.flag} {c2.name.split(" ")[0]} exports to {c1.name.split(" ")[0]}</div>
          <div style={{fontSize:18,fontWeight:700,color:C.coral}}>${c2Exports}B</div>
          <div style={{fontSize:9,color:C.mid,marginTop:3}}>{(c2Products||[]).join(" · ")}</div>
        </div>
      </div>
      <div style={{background:C.bg,borderRadius:8,padding:8,marginBottom:10}}>
        <div style={{fontSize:9,color:C.mid,marginBottom:3}}>Trade Balance</div>
        <div style={{display:"flex",gap:4,alignItems:"center",height:14}}>
          <div style={{flex:c1Exports,background:C.blue,borderRadius:2,height:10}}/>
          <div style={{flex:c2Exports,background:C.coral,borderRadius:2,height:10}}/>
        </div>
        <div style={{fontSize:10,marginTop:3,fontWeight:600,color:balance > 0 ? C.blue : C.coral}}>
          {balance > 0 ? c1.name.split(" ")[0] : c2.name.split(" ")[0]} surplus: ${Math.abs(balance)}B
        </div>
      </div>
      <div style={{fontSize:11,fontWeight:700,marginBottom:4}}>Total Bilateral Trade: ${(c1Exports||0)+(c2Exports||0)}B</div>
    </div>
  );
}

//  COMMODITIES VIEW 
function CommoditiesHeatmap({ commodities, selectedComm, setSelectedComm }) {
  const containerRef = useRef(null);
  const [nodes, setNodes] = useState([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.offsetWidth || 820;
    const h = 390;
    const root = d3.hierarchy({ name: "root", children: commodities.map(c => ({ ...c, value: c.marketSize })) })
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value);
    d3.treemap().size([w, h]).padding(3).round(true)(root);
    setNodes(root.leaves());
  }, [commodities]);

  // Re-run on container resize
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const w = containerRef.current.offsetWidth;
      const h = 390;
      const root = d3.hierarchy({ name: "root", children: commodities.map(c => ({ ...c, value: c.marketSize })) })
        .sum(d => d.value).sort((a, b) => b.value - a.value);
      d3.treemap().size([w, h]).padding(3).round(true)(root);
      setNodes(root.leaves());
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [commodities]);

  const yoyColor = (yoy) => {
    if (yoy > 30)  return "#1A6B3C";
    if (yoy > 10)  return "#2E9E5B";
    if (yoy > 0)   return "#6BAF84";
    if (yoy > -15) return "#D97B5A";
    if (yoy > -30) return "#C0392B";
    return "#8B1A1A";
  };

  return (
    <div>
      <div ref={containerRef} style={{ position: "relative", height: 390, background: "white", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
        {nodes.map(node => {
          const d = node.data;
          const bw = node.x1 - node.x0;
          const bh = node.y1 - node.y0;
          const isSelected = selectedComm === d.id;
          if (bw < 4 || bh < 4) return null;
          return (
            <div key={d.id}
              onClick={() => setSelectedComm(isSelected ? null : d.id)}
              style={{
                position: "absolute", left: node.x0, top: node.y0,
                width: bw, height: bh,
                background: yoyColor(d.yoy),
                border: isSelected ? "2px solid white" : "1px solid rgba(255,255,255,0.25)",
                boxSizing: "border-box", cursor: "pointer", overflow: "hidden",
                transition: "opacity 0.18s, border 0.18s",
                opacity: selectedComm && !isSelected ? 0.72 : 1,
                boxShadow: isSelected ? "inset 0 0 0 2px rgba(255,255,255,0.8)" : "none",
              }}>
              {bw > 44 && bh > 26 && (
                <div style={{ padding: "5px 7px" }}>
                  <div style={{ fontSize: Math.min(12, Math.max(8, bw / 8)), fontWeight: 700, color: "white", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {bw < 90 ? d.name.split(" ")[0] : d.name}
                  </div>
                  {bh > 44 && (
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.92)", marginTop: 2, fontWeight: 600 }}>
                      {d.yoy > 0 ? "+" : ""}{d.yoy.toFixed(1)}%
                    </div>
                  )}
                  {bh > 64 && bw > 80 && (
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.72)", marginTop: 1 }}>
                      {d.price.toLocaleString()} {d.unit}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {nodes.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.mid, fontSize: 12 }}>
            Computing layout...
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
        {[["Strong gain (>10%)", "#2E9E5B"], ["Modest gain (0-10%)", "#6BAF84"], ["Modest loss (0 to -15%)", "#D97B5A"], ["Sharp loss (>-15%)", "#C0392B"]].map(([l, col]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.mid }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: col }} />{l}
          </div>
        ))}
      </div>
    </div>
  );
}

function CommoditiesView({ selectedComm, setSelectedComm, commView, setCommView }) {
  const expandedComm = selectedComm ? COMMODITIES.find(c => c.id === selectedComm) : null;

  return (
    <div className="fade-in" style={{marginTop:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:18}}>Commodities Radar</h2>
        <div style={{display:"flex",gap:6}}>
          {["cards","heatmap"].map(v => (
            <button key={v} onClick={() => setCommView(v)}
              className={commView===v ? "tab-active" : "tab-inactive"}
              style={{padding:"4px 12px",borderRadius:16,border:"none",cursor:"pointer",fontSize:11,fontWeight:500,transition:"all 0.2s"}}>
              {v === "cards" ? "Cards" : "Heatmap"}
            </button>
          ))}
        </div>
      </div>

      {commView === "heatmap" && (
        <div>
          <p style={{fontSize:11,color:C.mid,marginBottom:8}}>Box size = global market size · Color = YoY performance · Click a box to expand details below</p>
          <CommoditiesHeatmap commodities={COMMODITIES} selectedComm={selectedComm} setSelectedComm={setSelectedComm} />
          {expandedComm && (
            <div className="card fade-in" style={{marginTop:12,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16}}>{expandedComm.name}</div>
                  <div style={{fontSize:12,color:C.mid}}>{expandedComm.unit}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,fontWeight:700}}>{expandedComm.price.toLocaleString()}</div>
                  <div style={{fontSize:12,fontWeight:600,color:pctColor(expandedComm.yoy)}}>{fmtPct(expandedComm.yoy)} YoY</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                <div>
                  <div style={{fontSize:9,fontWeight:700,color:C.charcoal,marginBottom:4}}>Top Producers</div>
                  {expandedComm.producers.map(([c,pct]) => (
                    <div key={c} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"2px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span>{c}</span><span style={{fontWeight:600,color:C.sage}}>{pct}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{fontSize:9,fontWeight:700,color:C.charcoal,marginBottom:4}}>Top Consumers</div>
                  {expandedComm.consumers.map(([c,pct]) => (
                    <div key={c} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"2px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span>{c}</span><span style={{fontWeight:600,color:C.coral}}>{pct}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{fontSize:9,fontWeight:700,color:C.charcoal,marginBottom:4}}>5-Year Range</div>
                  <div style={{fontSize:10,padding:"2px 0"}}>High: <strong>{expandedComm.hi5y.toLocaleString()}</strong></div>
                  <div style={{fontSize:10,padding:"2px 0"}}>Low: <strong>{expandedComm.lo5y.toLocaleString()}</strong></div>
                  <div style={{marginTop:8}}>
                    <Sparkline data={expandedComm.spark} color={expandedComm.yoy>=0?C.sage:C.coral} height={40} width={120}/>
                  </div>
                </div>
              </div>
              <div style={{background:C.goldLt,borderRadius:6,padding:"8px 10px",marginTop:10,fontSize:11,lineHeight:1.6,color:C.charcoal}}>
                {expandedComm.insight}
              </div>
            </div>
          )}
        </div>
      )}

      {commView === "cards" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
          {COMMODITIES.map(comm => (
            <div key={comm.id} className="card card-hover"
              style={{padding:14,cursor:"pointer",border:selectedComm===comm.id ? `2px solid ${C.blue}` : `1px solid ${C.border}`,transition:"all 0.2s ease-out"}}
              onClick={() => setSelectedComm(selectedComm === comm.id ? null : comm.id)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div>
                  <div style={{fontSize:12,fontWeight:700}}>{comm.name}</div>
                  <div style={{fontSize:10,color:C.mid}}>{comm.unit}</div>
                </div>
                <Sparkline data={comm.spark} color={comm.yoy >= 0 ? C.sage : C.coral} height={36} width={80}/>
              </div>
              <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
                <span style={{fontFamily:"'DM Serif Display',serif",fontSize:20,fontWeight:700}}>{comm.price.toLocaleString()}</span>
                <span style={{fontSize:11,fontWeight:600,color:pctColor(comm.yoy)}}>{fmtPct(comm.yoy)}</span>
              </div>
              <div style={{display:"flex",gap:12,fontSize:9,color:C.mid,marginBottom:selectedComm===comm.id ? 10 : 0}}>
                <span>5Y High: {comm.hi5y.toLocaleString()}</span>
                <span>5Y Low: {comm.lo5y.toLocaleString()}</span>
              </div>

              {selectedComm === comm.id && (
                <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:4}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                    <div>
                      <div style={{fontSize:9,fontWeight:700,color:C.charcoal,marginBottom:4}}>Top Producers</div>
                      {comm.producers.map(([c,pct]) => (
                        <div key={c} style={{display:"flex",justifyContent:"space-between",fontSize:9,padding:"1px 0"}}>
                          <span>{c}</span><span style={{fontWeight:600,color:C.sage}}>{pct}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{fontSize:9,fontWeight:700,color:C.charcoal,marginBottom:4}}>Top Consumers</div>
                      {comm.consumers.map(([c,pct]) => (
                        <div key={c} style={{display:"flex",justifyContent:"space-between",fontSize:9,padding:"1px 0"}}>
                          <span>{c}</span><span style={{fontWeight:600,color:C.coral}}>{pct}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{background:C.goldLt,borderRadius:6,padding:"6px 8px",fontSize:10,lineHeight:1.5,color:C.charcoal}}>
                    {comm.insight}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

//  RANKINGS VIEW 
function RankingsView({ rankSort, setRankSort }) {
  const data = RANKINGS[rankSort] || [];
  const maxVal = Math.max(...data.map(d => Math.abs(d.val)));
  return (
    <div className="fade-in" style={{marginTop:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:18}}>Global Rankings & Leaderboards</h2>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {Object.keys(RANKINGS).map(k => (
            <button key={k} onClick={() => setRankSort(k)}
              className={rankSort===k ? "tab-active" : "tab-inactive"}
              style={{padding:"4px 10px",borderRadius:14,border:"none",cursor:"pointer",fontSize:10,fontWeight:500,transition:"all 0.2s"}}>
              {k==="gdp"?"GDP":k==="exporters"?"Exporters":k==="surplus"?"Surplus":k==="deficit"?"Deficit":"GDP Growth"}
            </button>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Table */}
        <div className="card" style={{padding:16}}>
          <div style={{fontWeight:700,fontSize:12,marginBottom:10,color:C.charcoal}}>
            {rankSort==="gdp"?"Largest Economies (GDP 2023)":
             rankSort==="exporters"?"Largest Exporters (2022)":
             rankSort==="surplus"?"Largest Trade Surpluses":
             rankSort==="deficit"?"Largest Trade Deficits":
             "Fastest Growing Economies (2023)"}
          </div>
          {data.map((row, i) => (
            <div key={i} className="row-hover" style={{display:"flex",alignItems:"center",padding:"5px 4px",borderBottom:`1px solid ${C.border}`,gap:8,borderRadius:4}}>
              <span style={{width:16,fontSize:10,color:C.light,textAlign:"right"}}>{row.r}</span>
              <span style={{fontSize:14}}>{row.flag}</span>
              <span style={{flex:1,fontSize:11}}>{row.country}</span>
              <div style={{width:80,height:6,background:C.bg,borderRadius:3}}>
                <div style={{
                  width:`${(Math.abs(row.val)/maxVal)*100}%`,height:"100%",borderRadius:3,
                  background:rankSort==="deficit"?C.coral:rankSort==="surplus"?C.sage:rankSort==="growth"?C.gold:C.blue
                }}/>
              </div>
              <span style={{fontSize:11,fontWeight:700,width:70,textAlign:"right",
                color:rankSort==="deficit"?C.coral:rankSort==="surplus"?C.sage:rankSort==="growth"?C.gold:C.blue}}>
                {rankSort==="growth" ? `${row.val}%`
                  : rankSort==="deficit" ? `-$${Math.abs(row.val)}B`
                  : (rankSort==="gdp"||rankSort==="exporters") ? fmt(row.val)
                  : `$${row.val}B`}
              </span>
            </div>
          ))}
        </div>

        {/* Surprising Stats */}
        <div>
          <div className="card" style={{padding:16,marginBottom:12}}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:14,marginBottom:10}}>Surprising Stats</div>
            {SURPRISING_STATS.map((s,i) => (
              <div key={i} style={{marginBottom:10,paddingBottom:10,borderBottom:i<SURPRISING_STATS.length-1?`1px solid ${C.border}`:"none"}}>
                <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:2}}>{s.stat}</div>
                <div style={{fontSize:10,color:C.mid,lineHeight:1.5}}>{s.detail}</div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="card" style={{padding:16}}>
            <div style={{fontSize:11,fontWeight:700,marginBottom:8}}>Top 10 — Visual</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.slice(0,8).map(d => ({name:d.flag+" "+d.country.split(" ")[0], val:Math.abs(d.val)}))} layout="vertical" margin={{left:0,right:20,top:0,bottom:0}}>
                <XAxis type="number" hide/>
                <YAxis type="category" dataKey="name" width={80} tick={{fontSize:9}}/>
                <RechartTooltip formatter={(v) => [`$${v}B`]} contentStyle={{fontSize:10,borderRadius:6,border:`1px solid ${C.border}`}}/>
                <Bar dataKey="val" radius={[0,3,3,0]}>
                  {data.slice(0,8).map((_, i) => (
                    <Cell key={i} fill={rankSort==="deficit"?C.coral:rankSort==="surplus"?C.sage:rankSort==="growth"?C.gold:C.blue} fillOpacity={1-i*0.07}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

//  SUPPLY CHAIN VIEW 
function SupplyChainView({ selectedChain, setSelectedChain }) {
  const [selectedStep, setSelectedStep] = useState(null);
  const chain = SUPPLY_CHAINS[selectedChain];
  if (!chain) return null;

  return (
    <div className="fade-in" style={{marginTop:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:18}}>Supply Chain Tracer</h2>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {Object.entries(SUPPLY_CHAINS).map(([k,v]) => (
            <button key={k} onClick={() => { setSelectedChain(k); setSelectedStep(null); }}
              className={selectedChain===k ? "tab-active" : "tab-inactive"}
              style={{padding:"4px 12px",borderRadius:16,border:"none",cursor:"pointer",fontSize:11,fontWeight:500,transition:"all 0.2s"}}>
              {v.name}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{padding:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
          <h3 style={{fontFamily:"'DM Serif Display',serif",fontSize:16}}>{chain.name} Global Supply Chain</h3>
        </div>

        {/* Chain steps */}
        <div style={{display:"flex",alignItems:"flex-start",gap:0,overflowX:"auto",paddingBottom:8}}>
          {chain.steps.map((step, i) => (
            <div key={step.id} style={{display:"flex",alignItems:"center",flexShrink:0}}>
              <div
                onClick={() => setSelectedStep(selectedStep === i ? null : i)}
                style={{
                  width:140, borderRadius:10, padding:12, cursor:"pointer",
                  background: selectedStep === i ? chain.color : C.bg,
                  color: selectedStep === i ? "white" : C.charcoal,
                  border: `2px solid ${selectedStep === i ? chain.color : C.border}`,
                  transition:"all 0.2s ease-out",
                  boxShadow: selectedStep === i ? `0 4px 16px ${chain.color}44` : "none",
                }}>
                <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4,
                  color: selectedStep === i ? "white" : C.light}}>
                  Step {i+1}
                </div>
                <div style={{fontSize:11,fontWeight:700,marginBottom:4,lineHeight:1.3}}>{step.label}</div>
                <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                  {(step.countries||[]).map(id => (
                    <span key={id} style={{fontSize:11}}>{COUNTRIES[id]?.code || id}</span>
                  ))}
                </div>
              </div>
              {i < chain.steps.length - 1 && (
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"0 4px",marginTop:-10}}>
                  <div style={{width:24,height:2,background:chain.color,opacity:0.5}}/>
                  <div style={{color:chain.color,fontSize:10,marginTop:-2}}></div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Step detail */}
        {selectedStep !== null && chain.steps[selectedStep] && (
          <div style={{marginTop:16,background:C.bg,borderRadius:10,padding:14,animation:"fadeIn 0.2s ease-out"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div style={{fontWeight:700,fontSize:13}}>{chain.steps[selectedStep].label}</div>
              <div style={{display:"flex",gap:4}}>
                {(chain.steps[selectedStep].countries||[]).map(id => (
                  <span key={id} title={COUNTRIES[id]?.name} style={{fontSize:18}}>{COUNTRIES[id]?.code || id}</span>
                ))}
              </div>
            </div>
            <p style={{fontSize:11,lineHeight:1.6,color:C.charcoal}}>{chain.steps[selectedStep].detail}</p>
          </div>
        )}

        {!selectedStep && !selectedStep === 0 && (
          <div style={{marginTop:12,fontSize:11,color:C.mid,textAlign:"center"}}>
            Click any step to see detailed information about that stage of the supply chain.
          </div>
        )}
        {selectedStep === null && (
          <div style={{marginTop:12,fontSize:11,color:C.mid,textAlign:"center"}}>
            Click any step to see detailed information about that stage of the supply chain.
          </div>
        )}
      </div>
    </div>
  );
}

//  TRADE WAR VIEW 
function TradeWarView({ selectedScenario, setSelectedScenario }) {
  const sc = TRADE_WAR_SCENARIOS[selectedScenario];
  if (!sc) return null;
  return (
    <div className="fade-in" style={{marginTop:8}}>
      <div style={{marginBottom:12}}>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:18,marginBottom:4}}>Trade War Simulator</h2>
        <p style={{fontSize:11,color:C.mid}}>Educational scenario analysis using real bilateral trade data</p>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {TRADE_WAR_SCENARIOS.map((s,i) => (
          <button key={s.id} onClick={() => setSelectedScenario(i)}
            className={selectedScenario===i ? "tab-active" : "tab-inactive"}
            style={{padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:500,transition:"all 0.2s",lineHeight:1.3,textAlign:"left"}}>
            {s.title}
          </button>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div>
          {/* Scenario header */}
          <div className="card" style={{padding:16,marginBottom:12,background:`linear-gradient(135deg, ${C.coralLt}, ${C.blueLt})`}}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,marginBottom:2}}>{sc.title}</div>
            <div style={{fontSize:11,color:C.mid,marginBottom:10}}>{sc.subtitle}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              <div style={{background:"white",borderRadius:6,padding:8}}>
                <div style={{fontSize:9,color:C.light,marginBottom:2}}>Affected Trade</div>
                <div style={{fontSize:14,fontWeight:700}}>${sc.targetTrade}B</div>
              </div>
              <div style={{background:"white",borderRadius:6,padding:8}}>
                <div style={{fontSize:9,color:C.light,marginBottom:2}}>Tariff Rate</div>
                <div style={{fontSize:14,fontWeight:700}}>{sc.tariff}%</div>
              </div>
              <div style={{background:"white",borderRadius:6,padding:8}}>
                <div style={{fontSize:9,color:C.light,marginBottom:2}}>Annual Cost</div>
                <div style={{fontSize:14,fontWeight:700,color:C.coral}}>${(sc.targetTrade * sc.tariff / 100).toFixed(0)}B</div>
              </div>
            </div>
          </div>

          {/* Direct Impact */}
          <div className="card" style={{padding:14,marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,marginBottom:8}}>Direct Impact</div>
            <p style={{fontSize:11,lineHeight:1.6,color:C.charcoal,marginBottom:8}}>{sc.directImpact}</p>
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1,background:C.coralLt,borderRadius:6,padding:8}}>
                <div style={{fontSize:9,color:C.coral,fontWeight:700}}>Country 1 GDP Impact</div>
                <div style={{fontSize:16,fontWeight:700,color:C.coral}}>{sc.gdpImpact.country1}%</div>
              </div>
              <div style={{flex:1,background:C.coralLt,borderRadius:6,padding:8}}>
                <div style={{fontSize:9,color:C.coral,fontWeight:700}}>Country 2 GDP Impact</div>
                <div style={{fontSize:16,fontWeight:700,color:C.coral}}>{sc.gdpImpact.country2}%</div>
              </div>
            </div>
          </div>

          {/* Hit Sectors */}
          <div className="card" style={{padding:14}}>
            <div style={{fontSize:11,fontWeight:700,marginBottom:8}}>Most Affected Sectors</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {sc.hitSectors.map(s => (
                <span key={s} style={{background:C.coralLt,color:C.coral,borderRadius:4,padding:"3px 8px",fontSize:10,fontWeight:500}}>{s}</span>
              ))}
            </div>
          </div>
        </div>

        <div>
          {/* Beneficiaries */}
          <div className="card" style={{padding:14,marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,marginBottom:8}}>Trade Diversion Beneficiaries</div>
            <p style={{fontSize:10,color:C.mid,marginBottom:10}}>Countries that gain market share as trade is redirected:</p>
            {sc.beneficiaries.map(b => (
              <div key={b.country} style={{borderBottom:`1px solid ${C.border}`,padding:"8px 0",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:700}}>{b.country}</div>
                  <div style={{fontSize:10,color:C.mid,marginTop:2,lineHeight:1.4}}>{b.effect}</div>
                </div>
                <span style={{fontSize:12,fontWeight:700,color:C.sage,whiteSpace:"nowrap"}}>{b.delta}</span>
              </div>
            ))}
          </div>

          {/* Historical note */}
          <div style={{background:C.goldLt,border:`1px solid ${C.gold}33`,borderRadius:10,padding:14}}>
            <div style={{fontSize:10,fontWeight:700,color:C.gold,marginBottom:6}}>Historical Context</div>
            <p style={{fontSize:11,lineHeight:1.6,color:C.charcoal}}>{sc.historicalNote}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

//  CURRENCY VIEW 
function CurrencyView() {
  return (
    <div className="fade-in" style={{marginTop:8}}>
      <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:18,marginBottom:12}}>Currency & Reserves Tracker</h2>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16}}>
        <div>
          <div className="card" style={{padding:16,marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:12,marginBottom:10}}>Major Currency Pairs</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {CURRENCIES.map(c => (
                <div key={c.pair} className="card-hover" style={{background:C.bg,borderRadius:8,padding:10,cursor:"default"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontWeight:700,fontSize:12}}>{c.pair}</span>
                    <span style={{fontSize:9,background:c.regime==="Free Float"?C.blueLt:c.regime==="Managed Float"?C.goldLt:C.coralLt,
                      color:c.regime==="Free Float"?C.blue:c.regime==="Managed Float"?C.gold:C.coral,
                      borderRadius:4,padding:"1px 5px",fontWeight:600}}>
                      {c.regime}
                    </span>
                  </div>
                  <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
                    <span style={{fontFamily:"'DM Serif Display',serif",fontSize:20,fontWeight:700}}>{c.rate.toFixed(c.pair.includes("KRW")||c.pair.includes("JPY")?1:3)}</span>
                    <span style={{fontSize:11,fontWeight:600,color:pctColor(c.yoy)}}>{fmtPct(c.yoy)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <Sparkline data={c.spark} color={c.yoy>=0?C.sage:C.coral} height={32} width={80}/>
                    <div style={{fontSize:9,color:C.mid,textAlign:"right"}}>
                      <div>Hi: {c.hi5y}</div>
                      <div>Lo: {c.lo5y}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FX Reserves */}
        <div>
          <div className="card" style={{padding:16}}>
            <div style={{fontWeight:700,fontSize:12,marginBottom:10}}>Top 10 FX Reserves (2023)</div>
            {FX_RESERVES.map((r, i) => (
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{width:14,fontSize:10,color:C.light}}>{i+1}</span>
                  <span style={{fontSize:11}}>{r.country}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:60,height:5,background:C.bg,borderRadius:2}}>
                    <div style={{width:`${(r.reserves/3170)*100}%`,height:"100%",background:C.blue,borderRadius:2}}/>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:C.blue,width:48,textAlign:"right"}}>${r.reserves}B</span>
                </div>
              </div>
            ))}
            <div style={{marginTop:10,background:C.goldLt,borderRadius:6,padding:"6px 8px"}}>
              <p style={{fontSize:10,color:C.charcoal,lineHeight:1.5}}>
                China's $3.17T reserves are larger than #2-#10 combined. After Russia's reserves were frozen in 2022, central banks globally accelerated gold purchases and reserve diversification.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
