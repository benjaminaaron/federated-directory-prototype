import { addTriple, datasetToTurtle, getRdf, getWriter, newStore, storeFromTurtles, storeToTurtle, sparqlInsertDelete } from "@foerderfunke/sem-ops-utils"
import CsvwParser from "rdf-parser-csvw"
import { fileURLToPath } from "url"
import { DOMParser } from "xmldom"
import { Readable } from "stream"
import Papa from "papaparse"
import grapoi from "grapoi"
import path from "path"
import fs from "fs"

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(THIS_DIR, "out")
const prefixes = {
    civic: "https://civic-data.de/",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    schema: "http://schema.org/",
    rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    skos: "http://www.w3.org/2004/02/skos/core#",
    org: "http://www.w3.org/ns/org#", // W3C Organization Ontology, used by Core Public Organisation
    dct: "http://purl.org/dc/terms/",
    foaf: "http://xmlns.com/foaf/0.1/",
    csvw: "http://www.w3.org/ns/csvw#",
}
export const ns = (prefix, localName) => `${prefixes[prefix]}${localName}`

// caritas

async function transformCaritas() {
    let jsonContent = fs.readFileSync(`${OUT_DIR}/caritas.json`, "utf8")
    let data = JSON.parse(jsonContent)
    const csv = Papa.unparse(data)
    fs.writeFileSync(`${OUT_DIR}/caritas.csv`, csv)

    let inputStream = Readable.from([csv])
    let metadataDs = await getRdf().io.dataset.fromURL(`${THIS_DIR}/caritas.csv-metadata.json`)

    const parser = new CsvwParser({
        factory: getRdf(),
        baseIRI: "https://civic-data.de/",
        metadata: metadataDs
    })
    const outputDs = getRdf().dataset()
    await outputDs.import(parser.import(inputStream))

    function deleteDescendants(node) {
        for (const child of node.out()) {
            if (child.term.termType === "BlankNode") deleteDescendants(child)
        }
        node.deleteOut()
    }
    const poi = grapoi({ dataset: outputDs, factory: getRdf() })
    const startNode = poi.hasOut(getRdf().namedNode(ns("rdf", "type")), getRdf().namedNode(ns("csvw", "TableGroup")))
    deleteDescendants(startNode)

    const turtle = await datasetToTurtle(outputDs, prefixes)
    fs.writeFileSync(`${OUT_DIR}/caritas.ttl`, turtle)
}

// dhs

async function transformDHS() {
    let html = fs.readFileSync(`${OUT_DIR}/dhs.html`, "utf8")
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")

    const resultsUl = Array.from(doc.getElementsByTagName("ul")).find(u => ((u.getAttribute("class") || "").split(/\s+/).includes("results")))
    const items = resultsUl ? Array.from(resultsUl.getElementsByTagName("li")).filter(li => ((li.getAttribute("class") || "").split(/\s+/).includes("entryshort"))) : []
    const rows = items.map(li => {
        const strong = li.getElementsByTagName("strong")[0]
        const link = "https://www.dhs.de/" + strong?.getElementsByTagName("a")?.[0]?.getAttribute("href") || ""
        const id = link.split("cHash=")[1]
        const name = (strong?.getElementsByTagName("a")[0]?.textContent || strong?.textContent || "").trim()
        const p0 = li.getElementsByTagName("p")[0]
        let description = ""
        if (p0) description = p0.textContent.replace(name, "").trim().replace(/\s+/g, " ")
        const getSpanText = cls => {
            const span = Array.from(li.getElementsByTagName("span")).find(s => ((s.getAttribute("class") || "").split(/\s+/).includes(cls)))
            return span ? (span.textContent || "").trim() : ""
        }
        const strasse = getSpanText("strasse")
        const plzort = getSpanText("plzort")
        let telefon = getSpanText("telefon")
        telefon = telefon.replace(/^Tel\.:?\s*/i, "").trim()
        const emailSpan = Array.from(li.getElementsByTagName("span")).find(s => ((s.getAttribute("class") || "").split(/\s+/).includes("email")))
        const email = (emailSpan?.getElementsByTagName("a")[0]?.textContent || emailSpan?.textContent || "").trim()
        const websiteAnchor = Array.from(li.getElementsByTagName("span")).find(s => ((s.getAttribute("class") || "").split(/\s+/).includes("website")))?.getElementsByTagName("a")[0]
        const website = websiteAnchor ? (websiteAnchor.getAttribute("href") || websiteAnchor.textContent || "").trim() : ""
        return { id, name, description, strasse, plzort, telefon, email, website, link }
    })

    let store = newStore()
    for (let row of rows) {
        let subject = ns("civic", `orgAddr_${row.id}`)
        addTriple(store, subject, ns("rdf", "type"), ns("org", "PublicOrganisation"))
        let typeTriple = getRdf().quad(getRdf().namedNode(subject), getRdf().namedNode(ns("rdf", "type")), getRdf().namedNode(ns("civic", "OrgAddress")))
        store.addQuad(typeTriple)
        // store.addQuad(getRdf().quad(typeTriple, getRdf().namedNode(ns("civic", "source")), getRdf().literal("dhs")))

        addTriple(store, subject, ns("skos", "prefLabel"), row.name)
        if (row.description) addTriple(store, subject, ns("schema", "description"), row.description)
        addTriple(store, subject, ns("schema", "streetAddress"), row.strasse)
        addTriple(store, subject, ns("org", "postalCode"), row.plzort)
        addTriple(store, subject, ns("org", "telephone"), row.telefon)
        addTriple(store, subject, ns("foaf", "mbox"), row.email)
        addTriple(store, subject, ns("foaf", "homepage"), row.website)
        // addTriple(store, subject, ns("schema", "url"), row.link)
    }

    fs.writeFileSync(`${OUT_DIR}/dhs.ttl`, await storeToTurtle(store, prefixes))
    /*const writer = getWriter(prefixes)
    writer.addQuads(store.getQuads())
    writer.end((error, turtle) => fs.writeFileSync(`${OUT_DIR}/dhs.ttl`, turtle))*/
}

// merge

async function merge() {
    const store = await storeFromTurtles([
        fs.readFileSync(`${OUT_DIR}/caritas.ttl`, "utf8"),
        fs.readFileSync(`${OUT_DIR}/dhs.ttl`, "utf8")
    ])

    // postprocessing example
    let query = `
        PREFIX schema: <http://schema.org/>
        PREFIX civic: <https://civic-data.de/>
        INSERT {
            ?org civic:orgInBerlin "true"^^<http://www.w3.org/2001/XMLSchema#boolean> .
        } WHERE {
            ?org schema:contentType "Adresse" ;
                schema:addressLocality ?loc .
            FILTER regex(str(?loc), "berlin", "i")
        }`
    await sparqlInsertDelete(query, store)
    fs.writeFileSync(`${OUT_DIR}/merged.ttl`, await storeToTurtle(store), "utf8")

    /*const writer = getWriter(prefixes)
    writer.addQuads(turtle.getQuads())
    writer.end((error, result) => fs.writeFileSync(`${OUT_DIR}/merged.ttl`, result))*/
}

// ----------

await transformCaritas()
await transformDHS()
await merge()
