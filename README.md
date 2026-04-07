# TradeScope

**An interactive global trade flow visualization tool** built to explore bilateral trade relationships, commodity markets, supply chains, and trade war scenarios — all in one interface.

Data sourced from the World Bank, IMF, and UN Comtrade (2022/2023 estimates).

---

## What is TradeScope?

TradeScope is a single-page React application that transforms complex global trade data into an intuitive, interactive experience. Whether you're tracking how US–China tariff escalations ripple through Southeast Asian supply chains, analyzing commodity price trends across a decade, or understanding why the Netherlands exports more goods than India despite being 80× smaller, TradeScope gives you the tools to explore it all.

### Features

**World Map** — Click any of 22 countries to see their bilateral trade relationships rendered as animated arc flows. A second click isolates any specific trade corridor. Country detail panels show GDP, trade balance, top exports/imports, and key trading partners.

**Commodities** — A full commodities dashboard covering energy (Brent, WTI, natural gas), metals (gold, copper, lithium, nickel, uranium, palladium), and agricultural goods (wheat, soybeans, coffee, cotton). Each commodity includes a sparkline, 5-year hi/lo range, top producers and consumers, and a macro insight explaining the key geopolitical or structural driver.

**Rankings** — Sortable leaderboard tables ranking countries by GDP, export volume, trade surplus, trade deficit, and GDP growth rate.

**Supply Chains** — Step-by-step visualization of five global supply chains: Smartphones, Semiconductors, Electric Vehicles, Coffee, and Crude Oil. Each step maps the countries involved, the specific companies and materials, and the flow between stages.

**Trade War Scenarios** — Four richly annotated trade conflict scenarios, including the US–China electronics tariff, China's commodity restrictions on Australia, EU–US auto tariffs, and US semiconductor export controls on China. Each scenario models GDP impact, trade diversion beneficiaries, and historical context.

**Currency & FX Reserves** — Live-style FX pair cards with YoY performance, 5-year ranges, and a ranked bar chart of global foreign exchange reserves.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | [React 18](https://react.dev/) |
| Charts & Graphs | [Recharts](https://recharts.org/) |
| Map & Geo | [D3.js](https://d3js.org/) (geoNaturalEarth1, geoPath, geoGraticule) |
| Topology | [TopoJSON Client](https://github.com/topojson/topojson-client) + [world-atlas](https://github.com/topojson/world-atlas) |
| Styling | Inline CSS with design tokens + Google Fonts (DM Serif Display, Inter) |
| Build | Create React App |

---

## Getting Started

### Prerequisites

- Node.js 16+ and npm

### Install & Run

```bash
# Clone the repo
git clone <your-repo-url>
cd tradescope

# Install dependencies
npm install

# Start the development server
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

### Build for Production

```bash
npm run build
```

Outputs an optimized static bundle to the `/build` folder, ready for deployment to Netlify, Vercel, GitHub Pages, or any static host.

---

## Data Sources

- **World Bank** — GDP, GDP per capita, trade balance, FDI, current account, population
- **IMF** — Macroeconomic indicators, growth forecasts, debt-to-GDP
- **UN Comtrade** — Bilateral trade flows, top export/import commodities by country
- **ICE / CFTC** — Commodity price data and historical ranges
- **BIS / Central Banks** — FX rates, FX reserve data, central bank policy rates

All data reflects 2022/2023 annual estimates.

---

## Project Structure

```
tradescope/
├── public/
│   └── index.html          # HTML shell
├── src/
│   ├── App.jsx             # Main application (all views in one file)
│   ├── index.js            # React entry point
│   └── reportWebVitals.js  # Performance monitoring
├── package.json
├── .gitignore
└── README.md
```

---

## Built by

Danny Kwon — [dannybeyondit@gmail.com](mailto:dannybeyondit@gmail.com)
