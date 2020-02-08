let json = {};
let groups = {"dms":[], "empty": [], "other": []};
let tofinish = 0;

let maxres = 4000;

function onUpload(e) {
    let files = e.files;
    for(let i = 0; i < files.length; i++) {
        let file = files[i];
        let name = file.name;
        let path = file.webkitRelativePath || "";
        let splitted = path.split(/[/\\]/g);
        if(splitted[0] !== "messages") {
            alert("Please upload and only upload your messages directory of the discord datadump");
            console.error(splitted);
            return;
        }
        let current = json;
        for(let i = 1; i < splitted.length-1; i++) {
            let p = splitted[i];
            if(!current[p]) {
                current[p] = {};
            }
            current = current[p];
        }
        current[name] = file;
        if(name === "channel.json") {
            let fr = new FileReader();
            tofinish++;
            fr.onloadend = (e) => {
                if(!e.target) {
                    console.error("Unexpected error: e.target not defined" + e.target);
                    return;
                }
                if(e.error) {
                    console.error(e.error);
                    return;
                }
                let result = e.target.result;
                let content = JSON.parse(result);
                let out = {};
                if(content.recipients) {
                    out.type = "DM";
                    out.id = content.id;
                    out.recipients = content.recipients;
                    out.name = "";
                    groups["dms"].push(out);
                } else if(content.type === 0 && !content.guild) {
                    out.type = "Empty";
                    out.id = content.id;
                    groups["empty"].push(out);
                } else if(content.type === 3) {
                    out.type = "other";
                    out.id = content.id;
                    groups["other"].push(out);
                } else {
                    out.type = "Channel";
                    out.id = content.id;
                    try {
                        out.guild = content.guild.name;
                    }catch (e) {
                        console.error(content);
                        return;
                    }
                    out.name = content.name;
                    if(!groups[out.guild]) {
                        groups[out.guild] = [];
                    }
                    groups[out.guild].push(out);
                }
                current[name] = out;
                onComplete()
            };
            fr.readAsText(file);
        }
    }
}

function onComplete() {
    tofinish--;
    if(tofinish !== 0) {
        return;
    }
    let fr = new FileReader();
    fr.onloadend = (e) => {
        if(!e.target) {
            console.error("Unexpected error: e.target not defined" + e.target);
            return;
        }
        if(e.error) {
            console.error(e.error);
            return;
        }
        let result = e.target.result;
        let content = JSON.parse(result);
        for(let i = 0; i < groups.dms.length; i++) {
            let dm = groups.dms[i];
            if(content[dm.id]) {
                let name = content[dm.id] || "undefined";
                name = name.replace("Direct Message with ","");
                dm.name = name;
            }
        }
        onAllData();
    };
    fr.readAsText(json["index.json"])
}

function onAllData() {
    let formmodal = document.getElementById("formmodal");
    if(formmodal) {
        formmodal.setAttribute("hidden","");
    }
    let page = document.getElementById("body");
    if(page) {
        page.removeAttribute("hidden");
    }
    let leftside = document.getElementById("leftside");

    let groupkeys = Object.keys(groups).filter(key => key !== "empty" && key !== "other");
    for(let i = 0; i < groupkeys.length; i++) {
        let e = document.createElement("div");
        e.className = "sidebarentry";
        let radiobutton = document.createElement("input");
        radiobutton.setAttribute("type","radio");
        radiobutton.setAttribute("name", "groupselect");
        radiobutton.className = "sidebarradio";
        radiobutton.setAttribute("value", groupkeys[i]);
        radiobutton.setAttribute("onchange","onSelect(this.value)");
        let content = document.createElement("span");
        content.innerText = groupkeys[i];
        content.className = "sidebarcontent";
        e.appendChild(radiobutton);
        e.appendChild(content);
        leftside.appendChild(e);
    }
}

function onSelect(e) {
    let group = groups[e];
    let tocomplete = group.length;
    for(let x of group) {
        let channel = json[x.id];
        if(channel["messages.csv"].done) {
            tocomplete--;
            if(tocomplete === 0) {
                onSelectedCompleted(group);
            }
            continue;
        }
        let fr = new FileReader();
        fr.onloadend = (e) => {
            if(!e.target) {
                console.error("Unexpected error: e.target not defined" + e.target);
                return;
            }
            if(e.error) {
                console.error(e.error);
                return;
            }
            let result = e.target.result;
            let content = parseCSV(result);
            let out = {"done":true, "content": content, "lines": content.length};
            channel["messages.csv"] = out;
            tocomplete--;
            if(tocomplete === 0) {
                onSelectedCompleted(group);
            }
        };
        fr.readAsText(channel["messages.csv"]);
    }
}

function parseCSV(csv) {
    let keys = [];
    let gettingKeys = true;
    let current = "";
    let instring = false;
    let out = [];
    let currentElement = {};
    let currentkey = 0;
    for(let i = 0; i < csv.length; i++) {
        let char = csv[i];
        if(char !== "\"" && instring) {
            current += char;
            continue;
        } else if(instring && csv[i+1] && csv[i+1] === "\"") {
            current += "\"";
            i++;
            continue;
        }
        if(char === "\"") {
            if(instring) {
                instring = false;
                continue;
            }
            if(current !== "") {
                throw "Current not empty on start of string at " + i + "\nCurrent is '" + current + "'";
            }
            instring = true;
            continue;
        }
        if(char === "\n") {
            if (gettingKeys) {
                gettingKeys = false;
                keys.push(current);
                current = "";
            } else {
                putValue(currentElement, keys[currentkey], current);
                current = "";
                out.push(currentElement);
                currentElement = {};
                currentkey = 0;
            }
            continue;
        }
        if(char === ",") {
            if (gettingKeys) {
                keys.push(current);
                current = "";
            } else {
                putValue(currentElement, keys[currentkey], current);
                currentkey++;
                current = "";
            }
            continue;
        }
        current += char;
    }
    if(current !== "") {
        currentElement[keys[currentkey]] = current;
    }
    if(currentkey > 0) {
        out.push(currentElement);
    }
    return out;
}

function putValue(object, key, value) {
    if(key === "ID") {
        object[key] = value;
    } else if(key === "Timestamp") {
        object[key] = Date.parse(value);
    }
}

function onSelectedCompleted(group) {

    emptyGrid();
    buildGrid(group);

}

let content;
let start;
let end;

function emptyGrid() {
    if(!content) {
        content = document.getElementById("content");
        start = document.getElementById("start");
        end = document.getElementById("end");
        if(!content) {
            return;
        }
    }
    let childs = content.children;
    for(let i = 1; i < childs.length; i++) {
        content.removeChild(childs[i--]);
    }
}

function buildGrid(group) {
    let sorted = group.sort((c1, c2) => json[c2.id]["messages.csv"].lines - json[c1.id]["messages.csv"].lines);
    let count = 15;
    count--;
    let timestampmin = 0;
    let timestampmax = 0;
    for(let i = 0; i < sorted.length && i < count; i++) {
        let x = sorted[i];
        let channel = json[x.id];
        let messages = channel["messages.csv"].content;
        if(messages.length === 0) {
            continue;
        }
        for(let message of messages) {
            let timestamp = message.Timestamp;
            if(timestampmin === 0) {
                timestampmin = timestamp;
            } else {
                timestampmin = Math.min(timestampmin, timestamp);
            }
            timestampmax = Math.max(timestampmax, timestamp);
        }
    }

    let timestampdiff = timestampmax-timestampmin;

    start.innerText = new Date(timestampmin).toDateString();
    end.innerText = new Date(timestampmax).toDateString();

    let c = 0;

    for(let i = 0; i < sorted.length && i < count; i++) {
        let x = sorted[i];
        let channel = json[x.id];
        let [row, graph] = buildRow(x.name);
        graph.setAttribute("viewBox", `0 0 ${maxres} 10`);
        content.appendChild(row);
        let messages = channel["messages.csv"].content;
        let positions = [];
        for(let x of messages) {
            c++;
            let position = maxres*(x.Timestamp-timestampmin)/timestampdiff;
            position = position * 100 | 0;
            position /= 100;
            positions.push(position);
        }
        addPositions(graph, positions, i*1000);
    }
}

function addPositions(graph, positions, initialDelay) {
    let element = document.createElementNS('http://www.w3.org/2000/svg',"path");
    element.setAttributeNS(null, "d", "");
    graph.appendChild(element);
    setTimeout(() => {addPositionsRecursive(element, positions, "", 5000/positions.length)}, initialDelay);
}

function addPositionsRecursive(path, positions, current, sleep) {
    if(positions.length === 0) {
        return;
    }
    let loops = 1;
    if(sleep < 100) {
        loops = 100/sleep | 0;
    }
    for(let i = 0; i < loops && positions.length > 0; i++) {
        let pos = positions.pop();
        let line = `M${pos} 0 L${pos} 10`;
        current = current + " " + line;
    }
    path.setAttributeNS(null, "d", current);
    setTimeout(() => {addPositionsRecursive(path, positions, current, sleep)}, sleep < 100 ? 100 : sleep);
}

function buildRow(name) {
    let row = document.createElement("div");
    let nameSpan = document.createElement("span");
    let graph = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    row.className = "row";
    nameSpan.className = "name";
    graph.setAttribute("preserveAspectRatio","none");
    graph.setAttribute("class","graph");

    nameSpan.innerText = name === "" ? " " : name;

    row.appendChild(nameSpan);
    row.appendChild(graph);
    return [row, graph];
}

let page;

function resize() {
    if(!page) {
        page = document.getElementById("page");
        if(!page) {
            return;
        }
    }
    let height = page.offsetHeight;
    let width = page.offsetWidth;
    let contentwidth;
    let contentheight;
    if(height > width) {
        page.className = "rotate";

        contentwidth = height-100;
        contentheight = contentwidth*9/16;
        if(contentheight > width - 100) {
            contentheight = width - 100;
            contentwidth = contentheight*16/9;
        }
    } else {
        contentwidth = width-100;
        contentheight = contentwidth*9/16;
        if(contentheight > height - 100) {
            contentheight = height - 100;
            contentwidth = contentheight*16/9;
        }
        page.className = "";
    }

    let offsettop = (height-contentheight)/2;
    let offsetside = (width-contentwidth)/2;
    page.style.setProperty("--var-padding-height",offsettop + "px");
    page.style.setProperty("--var-padding-width",offsetside + "px");

}

window.addEventListener('resize', resize);
window.addEventListener('load', resize);