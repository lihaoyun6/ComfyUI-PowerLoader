import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function generateUUID() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === "x" ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const overlay = document.createElement("div");
overlay.id = "bottom-drop-port";
overlay.style.cssText = `
    display: none; 
    position: fixed;
    left: 0; top: 30vh;
    width: 100vw; height: 40vh;
    z-index: 100000;
    pointer-events: none;
    display: flex;
    flex-direction: row;
    gap: 15px;
    padding: 20px;
    box-sizing: border-box;
    backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
    border-top: 2px solid #8A8A8A;
    border-bottom: 2px solid #8A8A8A;
    box-shadow: 0 -10px 30px rgba(0,0,0,0.5);
    opacity: 0;
    transition: opacity 0.3s ease, background-color 0.3s ease, box-shadow 0.3s ease;
`;
document.body.appendChild(overlay);

let targetNodes = [];
let isShowing = false;
let enableOverlay = app.ui.settings.getSettingValue("PowerLoader.EnableOverlay", true);
let overlayHeight = app.ui.settings.getSettingValue("PowerLoader.OverlayHeight", 40);
let overlayPosition = app.ui.settings.getSettingValue("PowerLoader.OverlayPosition", "Center");

function updateLayout(nodes) {
    overlay.innerHTML = "";
    targetNodes = [...nodes].sort((a, b) => {
        const tA = (a.title || a.comfyClass).toLowerCase();
        const tB = (b.title || b.comfyClass).toLowerCase();
        
        return tA === tB
        ? a.id - b.id
        : tA.localeCompare(tB, undefined, {
            numeric: true,
            sensitivity: "base"
        });
    });

    targetNodes.forEach((node) => {
        const nodeId = node.id;
        const nodeTitle = node.title || node.type;
        const comfyClass = (node.comfyClass || "").toLowerCase();
        const nodeIcon = comfyClass.includes("video") ? "🎞️" : comfyClass.includes("image") ? "🖼️" : comfyClass.includes("audio") ? "🎧" : null;
        
        const cell = document.createElement("div");
        cell.className = "drop-cell";
        cell.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
            padding: 15px 10px;
            border: 2px dashed rgba(255, 255, 255, 0.3);
            border-radius: 15px;
            justify-content: flex-start;
            color: white;
            transition: all 0.2s ease;
            background: rgba(255, 255, 255, 0.05);
            min-width: 0;
        `;
        
        cell.innerHTML = `
            <div style="
                position: absolute;
                top: 8px; right: 8px;
                padding: 2px 8px;
                background: rgba(76, 175, 80, 0.15);
                border: 1px solid rgba(76, 175, 80, 0.3);
                border-radius: 8px;
                font-size: 0.85rem;
                color: #4CAF50;
                font-family: monospace;
                pointer-events: none;
                z-index: 2;">#${nodeId}
            </div>
            <div class="small-icon" style="
                position: absolute;
                top: 8px;
                left: 8px;
                padding: 2px 8px;
                font-size: 1rem;
                pointer-events: none;
                z-index: 2;">${nodeIcon}
            </div>
            
            <div style="height:25%; flex-shrink:0;"></div>
            <div class="drop-icon" style="
                font-size: 32px;
                pointer-events: none;
                line-height: 1;">${nodeIcon}
            </div>

            <div style="
                margin-top: 0.6rem;
                font-size: 1rem;
                font-weight: bold;
                text-align: center;
                width: 100%;
                white-space: normal;
                word-break: break-word;
                line-height: 1.3;
                pointer-events: none;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;">${nodeTitle}
            </div>
        `;
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const ICON_HIDE_HEIGHT = 5 * rem;
        const iconEl = cell.querySelector(".drop-icon");
        const iconSm = cell.querySelector(".small-icon");
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const h = entry.contentRect.height;
                iconEl.style.display = h < ICON_HIDE_HEIGHT ? "none" : "";
                iconSm.style.display = h > ICON_HIDE_HEIGHT ? "none" : "";
            }
        });
        observer.observe(cell);
        overlay.appendChild(cell);
    });
    
    overlay.style.display = "flex";
    isShowing = true;
    setTimeout(() => { 
        overlay.style.opacity = "1";
        overlay.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    }, 10);
}

function hideOverlay() {
    isShowing = false;
    overlay.style.opacity = "0";
    setTimeout(() => { if (!isShowing) overlay.style.display = "none"; }, 300);
}
    
async function uploadVideoToVHS(node, file) {
    if (!file) return;
    const accept = ["video/webm", "video/mp4", "video/x-matroska", "image/gif"];
    const isVideo = accept.includes(file.type) || file.name.endsWith('.mkv');
    if (!isVideo) return;
    
    const body = new FormData();
    body.append("image", file);
    body.append("type", "input");
    body.append("overwrite", "true");
    
    try {
        node.progress = 0.1; 
        
        const resp = await api.fetchApi("/upload/image", {
            method: "POST",
            body,
        });
        
        if (resp.status === 200) {
            const data = await resp.json();
            const filename = data.name;
            
            const pathWidget = node.widgets.find((w) => w.name === "video");
            if (pathWidget) {
                if (pathWidget.options && pathWidget.options.values) {
                    if (!pathWidget.options.values.includes(filename)) {
                        pathWidget.options.values.push(filename);
                    }
                }
                pathWidget.value = filename;
                pathWidget.callback?.(filename);
            }
            node.progress = undefined;
        } else {
            node.progress = undefined;
            const errorData = await resp.json();
            console.error("VHS Upload Failed:", errorData);
        }
    } catch (error) {
        node.progress = undefined;
        console.error("VHS Upload Error:", error);
    }
}
    
async function handleUpload(files, node) {
    if (node.comfyClass === "VHS_LoadVideo" || node.comfyClass === "VHS_LoadVideoFFmpeg1") {
        await uploadVideoToVHS(node, files[0]);
    } else if (node.comfyClass === "LoadImageBatch") {
        const validFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
        if (!validFiles.length) return;
        
        const widgets = node.widgets || [];
        const appendWidget = widgets.find(w => w.name === "append");
        const batchWidget = widgets.find(w => w.name === "batch");
        
        const isAppend = !!appendWidget?.value;
        const currentBatch = batchWidget?.value;
        const uuid = (isAppend && currentBatch && currentBatch !== "None") ? currentBatch : generateUUID();
        const subfolder = `batch/${uuid}`;
        
        try {
            await Promise.all(validFiles.map(file => {
                const body = new FormData();
                body.append("image", file);
                body.append("subfolder", subfolder);
                body.append("overwrite", "true");
                body.append("type", "input");
                return api.fetchApi("/upload/image", { method: "POST", body });
            }));
            
            if (batchWidget) {
                const values = batchWidget.options.values;
                if (!values.includes(uuid)) values.unshift(uuid);
                batchWidget.value = uuid;
                batchWidget.callback?.(uuid);
            }
            
            await api.fetchApi("/batch_preview/gen_batch", {
                method: "POST",
                body: JSON.stringify({ batch_folder: uuid }),
            }).catch(e => console.log("Preview service not found, skipping."));
            
        } catch (err) {
            console.error("Batch Upload Error:", err);
        }
    } else {
        const f = files[0];
        if (!f) return;
        const comfyClass = (node.comfyClass || "").toLowerCase();
        const nodeType = comfyClass.includes("video") ? "video" : comfyClass.includes("image") ? "image" : comfyClass.includes("audio") ? "audio" : "file";
        const widgetName = nodeType === "video" ? "file" : nodeType;
        if (!f.type.startsWith(`${nodeType}/`)) return;
        
        const b = new FormData();
        b.append("image", f);
        b.append("overwrite", "true");
        b.append("type", "input");
        const res = await api.fetchApi("/upload/image", { method: "POST", body: b });
        if (res.ok) {
            if (comfyClass.includes("VHS")) {
                const filename = d.name;
                const pathWidget = node.widgets.find(w => w.name === nodeType);
                if (pathWidget) {
                    if (pathWidget.options?.values && !pathWidget.options.values.includes(filename)) {
                        pathWidget.options.values.push(filename);
                    }
                    pathWidget.value = filename;
                    pathWidget.callback?.(filename);
                }
            } else {
                const d = await res.json();
                const w = node.widgets.find(x => x.name === widgetName);
                if (w) { w.value = d.name; w.callback?.(d.name); }
            }
        }
    }
}

app.registerExtension({
    name: "ComfyUI.PowerLoader",
    
    settings: [
        {
            id: "PowerLoader.EnableOverlay",
            category: ["PowerLoader", "General", "Enable PowerLoader"],
            name: "Enable PowerLoader",
            type: "boolean",
            defaultValue: true,
            onChange: (value) => { enableOverlay = value }
        },
        {
            id: "PowerLoader.OverlayPosition",
            category: ["PowerLoader", "Overlay", "Overlay Position"],
            name: "Overlay Position",
            type: "combo",
            options: ["Top", "Center", "Bottom"],
            defaultValue: "Center",
            onChange: (value) => {
                overlayPosition = value;
                if (value === "Center") {
                    overlay.style.top = ((100 - overlayHeight) / 2) + "vh";
                } else if (value === "Top"){
                    overlay.style.top = "0vh";
                } else {
                    overlay.style.top = (100 - overlayHeight) + "vh";
                }
            }
        },
        {
            id: "PowerLoader.OverlayHeight",
            category: ["PowerLoader", "Overlay", "Overlay Height"],
            name: "Overlay Height (%)",
            type: "slider",
            defaultValue: 40,
            attrs: { min: 30, max: 90, step: 5 },
            onChange: (value) => {
                overlayHeight = value;
                overlay.style.height = value + "vh";
                overlay.style.top = ((100 - value) / 2) + "vh";
            }
        },
    ],
    
    async setup() {
        overlay.style.height = overlayHeight + "vh";
        overlay.style.top = ((100 - overlayHeight) / 2) + "vh";
        
        window.addEventListener("dragenter", (e) => {
            if (!e.dataTransfer.types.includes("Files") || !enableOverlay) return;
            const targetTypes = [
                "LoadImage",
                "LoadImageMask",
                "LoadImageOutput",
                "LoadImageBatch",
                "LoadVideo",
                "LoadAudio",
                "VHS_LoadVideo",
                "VHS_LoadVideoFFmpeg",
                "VHS_LoadAudioUpload"
            ];
            const nodes = app.graph._nodes.filter(node => targetTypes.includes(node.type));
            
            if (nodes.length > 0 && !isShowing) {
                updateLayout(nodes);
            }
        }, true);

        window.addEventListener("dragover", (e) => {
            if (!isShowing || !enableOverlay) return;
            let isTargetZone = false;
            
            if (overlayPosition === "Center"){
                overlay.style.top = ((100 - overlayHeight) / 2) + "vh";
                isTargetZone = e.clientY > window.innerHeight * ((100-overlayHeight)/200) && e.clientY < window.innerHeight * ((100+overlayHeight)/200);
            }else if (overlayPosition === "Top"){
                overlay.style.top = "0vh";
                isTargetZone = e.clientY < window.innerHeight * (overlayHeight/100)
            } else {
                overlay.style.top = (100 - overlayHeight) + "vh";
                isTargetZone = e.clientY > window.innerHeight * ((100-overlayHeight)/100)
            }

            if (!e.shiftKey && isTargetZone) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                overlay.style.pointerEvents = "auto";
                overlay.style.opacity = "1";

                const cells = overlay.querySelectorAll(".drop-cell");
                cells.forEach(cell => {
                    const r = cell.getBoundingClientRect();
                    const isHover = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
                    if (isHover) {
                        cell.style.borderColor = "#4CAF50";
                        cell.style.background = "rgba(76, 175, 80, 0.25)";
                        cell.style.transform = "translateY(-5px)";
                        cell.style.boxShadow = "0 10px 20px rgba(0,0,0,0.3)";
                    } else {
                        cell.style.borderColor = "rgba(255, 255, 255, 0.3)";
                        cell.style.background = "rgba(255, 255, 255, 0.05)";
                        cell.style.transform = "translateY(0)";
                        cell.style.boxShadow = "none";
                    }
                });
            } else {
                overlay.style.pointerEvents = "none";
                overlay.style.opacity = "0.3";
                
                if (e.clientX <= 2 || e.clientY <= 2 || e.clientX >= window.innerWidth - 2 || e.clientY >= window.innerHeight - 2) {
                    hideOverlay();
                }
            }
        }, true);

        window.addEventListener("dragleave", (e) => {
            if (!e.relatedTarget) { hideOverlay() }
        }, true);

        window.addEventListener("drop", async (e) => {
            if (!isShowing || !enableOverlay) return;
            
            const isTargetZone = e.clientY > window.innerHeight * 0.3 && e.clientY < window.innerHeight * 0.7;
            if (!e.shiftKey && isTargetZone) {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                
                const cells = overlay.querySelectorAll(".drop-cell");
                let targetIndex = -1;
                cells.forEach((c, i) => {
                    const r = c.getBoundingClientRect();
                    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) targetIndex = i;
                });

                if (targetIndex !== -1) {
                    await handleUpload(e.dataTransfer.files, targetNodes[targetIndex]);
                }
            }
            hideOverlay();
        }, true);

        //window.addEventListener("keydown", (e) => { if (e.key === "Escape") hideOverlay(); });
    }
});