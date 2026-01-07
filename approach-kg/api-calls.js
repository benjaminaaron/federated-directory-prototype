import { fileURLToPath } from "url"
import path from "path"
import fs from "fs"

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "out")

// https://www.caritas.de/adressen-ergebnisse
// diese gibts auch, aber das scheint nur ein Subset zu sein: https://www.caritas.de/hilfeundberatung/onlineberatung/allgemeine-soziale-beratung/adressen
async function queryCaritas() {
    const result = await fetch("https://www.caritas.de/Api/search/searchbyquery", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            WebsiteGuid: "52c60690-787a-40ac-965c-a087c020c5f5", // do these expire?
            ModuleGuid: "02d40a73-ce67-49b6-9df7-dea1041d8dc4",
            Location: "10115" // Berlin-Mitte
        })
    })
    let json = await result.json()
    fs.writeFileSync(`${OUT_DIR}/caritas.json`, JSON.stringify(json, null, 2))
}

// https://www.dhs.de/service/suchthilfeverzeichnis/
async function queryDHS() {
    const params = new URLSearchParams({
        "tx_wwdhseinrichtung2_fe1[action]": "search",
        "tx_wwdhseinrichtung2_fe1[entrys][currentPage]": "1",
        "tx_wwdhseinrichtung2_fe1[plzort]": "10115"
    })
    const url = `https://www.dhs.de/service/suchthilfeverzeichnis/?${params.toString()}`
    const response = await fetch(url)
    const html = await response.text()
    // DOM parsing TODO
    fs.writeFileSync(`${OUT_DIR}/dhs.html`, html)
}

// https://einrichtungsdatenbank.awo.org/organisations/public-search/
async function queryAWO() {
    const url = "https://einrichtungsdatenbank.awo.org/organisations/public-search/-1/-1/-1"
    const formData = new URLSearchParams({
        "geo_source": "10115",
        "radius": "5"
    })
    const response = await fetch(url, {
        method: "POST",
        body: formData
    })
    const html = await response.text()
    // DOM parsing TODO
    fs.writeFileSync(`${OUT_DIR}/awo.html`, html)
}

fs.mkdirSync("out", { recursive: true })
await queryCaritas()
await queryDHS()
await queryAWO()
