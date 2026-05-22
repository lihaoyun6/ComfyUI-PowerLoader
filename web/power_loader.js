import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

let i18n = {};
let baseI18n = {
    general: "General",
    highlight: "Highlight",
    hotkey: "Hotkey",
    overlay: "Overlay",
    enable: "Enable PowerLoader",
    shift_key_to: "Hold Shift Key to",
    pos: "Overlay Position",
    height: "Overlay Size (%)",
    offset: "Overlay Offset (px)",
    hover_behavior: "Highlight Method",
    hover_anim: "Animation",
    hover_dura: "Duration (ms)",
    previewer: "Previewer",
    previewer_size: "Preview Size (%)",
    previewer_pos: "Preview Position",
};

const overlay = document.createElement("div");
overlay.id = "bottom-drop-port";
overlay.style.cssText = `
    display: none; 
    position: fixed;
    left: 0; top: 0vh;
    width: 100vw; height: 40vh;
    z-index: 100000;
    pointer-events: none;
    display: flex; opacity: 0;
    flex-direction: row;
    gap: 15px; padding: 15px;
    box-sizing: border-box;
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    border: 1px solid #8A8A8A;
    box-shadow: 0 -10px 30px rgba(0,0,0,0.5);
    transition: opacity 0.3s ease, background-color 0.3s ease, box-shadow 0.3s ease;
`;
document.body.appendChild(overlay);

let targetNodes = [];
let isShowing = false;
let isTargetZone = false;
let panAnimationId = null;
let lastNavigatedNode = null;
let initialCanvasState = null;
let enableOverlay = app.ui.settings.getSettingValue("PowerLoader.EnableOverlay", true);
let shiftBehavior = app.ui.settings.getSettingValue("ShiftBehavior", true);
let overlayHeight = app.ui.settings.getSettingValue("PowerLoader.OverlayHeight", 40);
let overlayPosition = app.ui.settings.getSettingValue("PowerLoader.OverlayPosition", "Bottom");
let overlayOffset = app.ui.settings.getSettingValue("PowerLoader.OverlayOffset", 0);
let highlightMethod = app.ui.settings.getSettingValue("PowerLoader.HighlightMethod", "Spotlight+");
let animation = app.ui.settings.getSettingValue("PowerLoader.Animation", true);
let duration = app.ui.settings.getSettingValue("PowerLoader.Duration", 150);
let previeweSize = app.ui.settings.getSettingValue("PowerLoader.Previewer.Size", 50);
let previewePos = app.ui.settings.getSettingValue("PowerLoader.Previewer.Position", "Bottom Left");
let enablePreviewer = app.ui.settings.getSettingValue("PowerLoader.Previewer.EnablePreviewer", true);

async function loadI18n() {
    const comfyLang = app.ui.settings.getSettingValue("Comfy.Locale", "en");
    const baseUrl = new URL("./i18n/", import.meta.url).href;
    
    if (comfyLang !== "en") {
        try {
            const responseLang = await fetch(`${baseUrl}${comfyLang}.json`);
            if (responseLang.ok) {
                const langData = await responseLang.json();
                i18n = { ...baseI18n, ...langData };
            } else {
                i18n = baseI18n;
            }
        } catch (e) {
            console.log(e);
            i18n = baseI18n;
        }
    } else {
        i18n = baseI18n;
    }
}

function generateUUID() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === "x" ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function smoothPanTo(targetX, targetY, duration) {
    if (panAnimationId) cancelAnimationFrame(panAnimationId);
    
    const ds = app.canvas.ds;
    const startX = ds.offset[0];
    const startY = ds.offset[1];
    const startTime = performance.now();
    
    function animate(time) {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        
        ds.offset[0] = startX + (targetX - startX) * ease;
        ds.offset[1] = startY + (targetY - startY) * ease;
        
        app.canvas.setDirty(true, true);
        
        if (progress < 1) {
            panAnimationId = requestAnimationFrame(animate);
        }
    }
    panAnimationId = requestAnimationFrame(animate);
}

function updateLayout(nodes) {
    overlay.innerHTML = "";
    targetNodes = [...nodes].sort((a, b) => {
        const tA = (a.title || a.comfyClass || a.type || "undefined").toLowerCase();
        const tB = (b.title || b.comfyClass || b.type || "undefined").toLowerCase();
        
        return tA === tB
        ? a.id - b.id
        : tA.localeCompare(tB, undefined, {
            numeric: true,
            sensitivity: "base"
        });
    });

    targetNodes.forEach((node) => {
        const nodeId = node.id;
        const nodeTitle = node.title || `@${node.comfyClass || node.type}`;
        const comfyClass = (node.comfyClass || node.type || "").toLowerCase();
        const nodeIcon = comfyClass.includes("video") ? "🎞️"
        : comfyClass.includes("image") ? "🖼️"
        : comfyClass.includes("audio") ? "🎧"
        : comfyClass.includes("zip") ? "📄"
        : "❓";
        
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
            padding: 10px 10px;
            border: 2px dashed rgba(255, 255, 255, 0.3);
            border-radius: 15px;
            justify-content: center;
            color: white;
            transition: all 0.2s ease;
            background: rgba(255, 255, 255, 0.05);
            min-width: 0;
        `;
        
        cell.innerHTML = `
            <div style="
                position: absolute;
                top: 8px; right: 8px;
                padding: 1px 8px;
                background: rgba(76, 175, 80, 0.15);
                border: 1px solid rgba(76, 175, 80, 0.3);
                border-radius: 7px;
                font-size: 0.85rem;
                color: #4CAF50;
                font-family: monospace;
                pointer-events: none;
                z-index: 2;">
            #${nodeId}
            </div>
            <div class="small-icon" style="
                position: absolute;
                top: 6px; left: 9px;
                font-size: 1.2rem;
                pointer-events: none;
                z-index: 2;">
            ${nodeIcon}
            </div>
            <div class="drop-icon" style="
                font-size: 2rem;
                margin-bottom: 0.6rem;
                pointer-events: none;">
                ${nodeIcon}
            </div>
            <div style="
                font-size: 1rem; font-weight: bold;
                text-align: center; line-height: 1.3;
                width: 90%; overflow: hidden;
                word-break: break-word;
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
                text-overflow: ellipsis; pointer-events: none;">
                ${nodeTitle}
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

function hideOverlay(e, t = false) {
    if (t) {
        overlay.style.pointerEvents = "none";
        overlay.style.opacity = ((shiftBehavior && !e.shiftKey) || (!shiftBehavior && e.shiftKey)) ? "0.3" : "0";
    } else {
        isShowing = false;
        overlay.style.opacity = "0";
        setTimeout(() => { if (!isShowing) overlay.style.display = "none"; }, 300);
    }
    
    if (highlightMethod !== "No Action" && initialCanvasState) {
        app.canvas.ds.offset[0] = initialCanvasState.offset[0];
        app.canvas.ds.offset[1] = initialCanvasState.offset[1];
        app.canvas.ds.scale = initialCanvasState.scale;
        if (!t) initialCanvasState = null;
    }
    
    if (lastNavigatedNode) lastNavigatedNode = null;
    app.canvas.deselectAllNodes();
    app.canvas.setDirty(true, true);
}
    
async function handleUpload(files, node) {
    const comfyClass = node.comfyClass || node.type || "undefined"

    if (comfyClass?.includes("VHS_LoadVideo")) {
        await uploadVideoToVHS(node, files[0]);
        return;
    }

    if (comfyClass === "LoadImageBatch") {
        await uploadImageBatch(node, files)
        return;
    }
    
    if (comfyClass === "LoadZipBatch") {
        await uploadZip(node, files[0])
        return;
    }

    const f = files[0];
    if (!f) return;
    const c = comfyClass.toLowerCase();
    const nodeType = c.includes("video") ? "video" : c.includes("image") ? "image" : c.includes("audio") ? "audio" : "file";
    if (!f.type.startsWith(`${nodeType}/`)) return;
    
    const body = new FormData();
    body.append("image", f); body.append("overwrite", "true"); body.append("type", "input");
    const resp = await api.fetchApi("/upload/image", { method: "POST", body });
    if (resp.ok) {
        const data = await resp.json();
        const widget = node.widgets.find(w => ["image", "video", "audio", "file"].includes(w.name));
        if (widget) {
            if (!widget.options.values.includes(data.name)) widget.options.values.push(data.name);
            widget.value = data.name; widget.callback?.(data.name);
        }
    }
}
            
async function uploadZip(node, file) {
    const isZipExt = file.name.toLowerCase().endsWith(".zip");
    if (!isZipExt) return;
    const w = node.widgets || [];
    const btn = w.find(w => w.type === "button");
    const originalLabel = btn ? btn.name : "Upload Zip";
    if (btn) btn.name = "Uploading...";
    try {
        const body = new FormData();
        body.append("image", file); b.append("subfolder", "zip");
        body.append("overwrite", "true"); b.append("type", "input");
        const resp = await api.fetchApi("/upload/image", { method: "POST", body: body });
        if (resp.ok) {
            const data = await resp.json();
            const widget = node.widgets.find(w => w.name === "filename");
            if (widget) {
                if (widget.options.values.length === 1 && widget.options.values[0] === "None") {
                    widget.options.values = [];
                }
                if (!widget.options.values.includes(data.name)) widget.options.values.unshift(data.name);
                widget.value = data.name; widget.callback?.(data.name);
            }
        }
    } catch (e) { console.error(e); } finally {
        if (btn) btn.name = originalLabel;
        //app.graph.setDirtyCanvas(true, true);
    }
}
            
async function uploadImageBatch(node, files) {
    const validFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!validFiles.length) return;
    const w = node.widgets || [];
    const isAppend = !!w.find(x => x.name === "append")?.value;
    const currentBatch = w.find(x => x.name === "batch")?.value;
    const uuid = (isAppend && currentBatch && currentBatch !== "None") ? currentBatch : generateUUID();
    const btn = w.find(w => w.type === "button");
    const originalLabel = btn ? btn.name : "Choose files to upload";
    if (btn) btn.name = `Uploading ${validFiles.length} files...`;
    
    try {
        await Promise.all(validFiles.map(file => {
            const b = new FormData();
            b.append("image", file); b.append("subfolder", `batch/${uuid}`);
            b.append("overwrite", "true"); b.append("type", "input");
            return api.fetchApi("/upload/image", { method: "POST", body: b });
        }));
        const bw = w.find(x => x.name === "batch");
        if (bw) {
            if (!bw.options.values.includes(uuid)) bw.options.values.unshift(uuid);
            bw.value = uuid; bw.callback?.(uuid);
        }
        if (btn) btn.name = "Generating Preview...";
        await api.fetchApi("/batch_preview/gen_batch", {
            method: "POST",
            body: JSON.stringify({ batch_folder: uuid }),
        }).catch(e => console.log("Preview service not found, skipping."));
    } catch (e) { console.error(e); } finally {
        if (btn) btn.name = originalLabel;
        //app.graph.setDirtyCanvas(true, true);
    }
}

async function uploadVideoToVHS(node, file) {
    if (!file) return;
    const accept = ["video/webm", "video/mp4", "video/x-matroska", "image/gif"];
    const isVideo = accept.includes(file.type) || file.name.endsWith('.mkv');
    if (!isVideo) return;
    
    const body = new FormData();
    body.append("image", file); body.append("type", "input"); body.append("overwrite", "true");
    try {
        node.progress = 0.1;
        const resp = await api.fetchApi("/upload/image", { method: "POST", body });
        if (resp.ok) {
            const data = await resp.json();
            const w = node.widgets.find(w => w.name === "video");
            if (w) {
                if (!w.options.values.includes(data.name)) w.options.values.push(data.name);
                w.value = data.name; w.callback?.(data.name);
            }
        }
    } finally { node.progress = undefined; }
}

function calcTop() {
    if (overlayPosition === "Top") {
        overlay.style.flexDirection = "row";
        overlay.style.height = overlayHeight + "vh";
        overlay.style.width = "100vw";
        overlay.style.left = "0";
        overlay.style.top = overlayOffset + "px";
    } else if (overlayPosition === "Bottom") {
        overlay.style.flexDirection = "row";
        overlay.style.height = overlayHeight + "vh";
        overlay.style.width = "100vw";
        overlay.style.left = "0";
        overlay.style.top = `calc(${100 - overlayHeight}vh - ${overlayOffset}px)`;
    } else if (overlayPosition === "Left") {
        overlay.style.flexDirection = "column";
        overlay.style.height = "100vh";
        overlay.style.width = overlayHeight + "vw";
        overlay.style.left = overlayOffset + "px";
        overlay.style.top = "0";
    } else if (overlayPosition === "Right") {
        overlay.style.flexDirection = "column";
        overlay.style.height = "100vh";
        overlay.style.width = overlayHeight + "vw";
        overlay.style.left = `calc(${100 - overlayHeight}vw - ${overlayOffset}px)`;
        overlay.style.top = "0";
    }
}

app.registerExtension({
    name: "ComfyUI.PowerLoader",
    
    async init() {
        await loadI18n();
        app.ui.settings.addSetting({
            id: "PowerLoader.EnableOverlay",
            category: ["PowerLoader", i18n.general],
            name: i18n.enable,
            type: "boolean",
            defaultValue: true,
            onChange: (value) => { enableOverlay = value }
        });
        
        app.ui.settings.addSetting({
            id: "PowerLoader.ShiftBehavior",
            category: ["PowerLoader", i18n.hotkey],
            name: i18n.shift_key_to,
            type: "combo",
            options: ["Hide Overlay", "Show Overlay"],
            defaultValue: "Hide Overlay",
            onChange: (value) => { shiftBehavior = (value === "Hide Overlay") ? true : false }
        });
        
        app.ui.settings.addSetting({
            id: "PowerLoader.Duration",
            category: ["PowerLoader", i18n.highlight, i18n.hover_dura],
            name: i18n.hover_dura,
            type: "slider",
            defaultValue: 150,
            attrs: { min: 50, max: 300, step: 50 },
            onChange: (value) => { duration = value }
        });
        
        app.ui.settings.addSetting({
            id: "PowerLoader.Animation",
            category: ["PowerLoader", i18n.highlight, i18n.hover_anim],
            name: i18n.hover_anim,
            type: "boolean",
            defaultValue: true,
            onChange: (value) => { animation = value }
        });
        
        app.ui.settings.addSetting({
            id: "PowerLoader.HighlightMethod",
            category: ["PowerLoader", i18n.highlight, i18n.hover_behavior],
            name: i18n.hover_behavior,
            type: "combo",
            options: ["None", "WideView", "Spotlight", "Spotlight+"],
            defaultValue: "Spotlight+",
            onChange: (value) => { highlightMethod = value }
        });
        
        app.ui.settings.addSetting({
            id: "PowerLoader.OverlayOffset",
            category: ["PowerLoader", i18n.overlay, i18n.offset],
            name: i18n.offset,
            type: "slider",
            defaultValue: 0,
            attrs: { min: 0, max: 720, step: 1 },
            onChange: (value) => {
                overlayOffset = value;
                calcTop();
            }
        });
        
        app.ui.settings.addSetting({
            id: "PowerLoader.OverlayHeight",
            category: ["PowerLoader", i18n.overlay, i18n.height],
            name: i18n.height,
            type: "slider",
            defaultValue: 40,
            attrs: { min: 10, max: 100, step: 5 },
            onChange: (value) => {
                overlayHeight = value;
                calcTop();
            }
        });
        
        app.ui.settings.addSetting({
            id: "PowerLoader.OverlayPosition",
            category: ["PowerLoader", i18n.overlay, i18n.pos],
            name: i18n.pos,
            type: "combo",
            options: ["Top", "Bottom", "Left", "Right"],
            defaultValue: "Bottom",
            onChange: (value) => {
                overlayPosition = value;
                calcTop();
            }
        });
        
        const oldPosition = app.ui.settings.getSettingValue("PowerLoader.OverlayPosition", "Bottom");
        if (oldPosition === "Center") overlayPosition = "Bottom";
    },
    
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
                "LoadZipBatch",
                "LoadVideo",
                "LoadAudio",
                "VHS_LoadVideo",
                "VHS_LoadVideoFFmpeg",
                "VHS_LoadAudioUpload"
            ];
            const nodes = app.graph._nodes.filter(node => targetTypes.includes(node.type));
            
            if (nodes.length > 0 && !isShowing && initialCanvasState === null) {
                initialCanvasState = {offset: [...app.canvas.ds.offset], scale: app.canvas.ds.scale};
                updateLayout(nodes);
            }
        }, true);

        window.addEventListener("dragover", (e) => {
            if (!isShowing || !enableOverlay) return;
            
            const vh = window.innerHeight;
            const vw = window.innerWidth;
            const y = e.clientY;
            const x = e.clientX;
            
            if (overlayPosition === "Top") {
                isTargetZone = y > (overlayOffset) && y < (vh * overlayHeight/100 + overlayOffset);
            } else if (overlayPosition === "Bottom") {
                isTargetZone = y > (vh * (100-overlayHeight)/100 - overlayOffset) && y < (vh - overlayOffset);
            } else if (overlayPosition === "Left") {
                isTargetZone = x > (overlayOffset) && x < (vw * overlayHeight/100 + overlayOffset);
            } else if (overlayPosition === "Right") {
                isTargetZone = x > (vw * (100-overlayHeight)/100 - overlayOffset) && x < (vw - overlayOffset);
            }
            
            calcTop();
            
            if (((shiftBehavior && !e.shiftKey) || (!shiftBehavior && e.shiftKey)) && isTargetZone) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                overlay.style.pointerEvents = "auto";
                overlay.style.opacity = "1";
                
                let currentHoveredNode = null;
                const cells = overlay.querySelectorAll(".drop-cell");
                cells.forEach((cell, idx) => {
                    const r = cell.getBoundingClientRect();
                    const isHover = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
                    if (isHover) {
                        cell.style.borderColor = "#4CAF50";
                        cell.style.background = "rgba(76, 175, 80, 0.25)";
                        cell.style.transform = "translateY(-5px)";
                        cell.style.boxShadow = "0 10px 20px rgba(0,0,0,0.3)";
                        currentHoveredNode = targetNodes[idx];
                    } else {
                        cell.style.borderColor = "rgba(255, 255, 255, 0.3)";
                        cell.style.background = "rgba(255, 255, 255, 0.05)";
                        cell.style.transform = "translateY(0)";
                        cell.style.boxShadow = "none";
                    }
                });
                
                if (highlightMethod !== "None" && currentHoveredNode && currentHoveredNode !== lastNavigatedNode) {
                    lastNavigatedNode = currentHoveredNode;
                    app.canvas.deselectAllNodes();
                    
                    if (highlightMethod === "WideView") {
                        app.canvas.selectItems();
                        if (animation) {
                            app.canvas.fitViewToSelectionAnimated({duration: duration, padding: 0});
                        } else {
                            app.canvas.fitViewToSelectionAnimated({duration: 1, padding: 0});
                        }
                        app.canvas.selectNode(currentHoveredNode);
                    } else if (highlightMethod === "Spotlight") {
                        app.canvas.selectNode(currentHoveredNode);
                        if (animation) {
                            app.canvas.fitViewToSelectionAnimated({duration: duration, padding: 0});
                        } else {
                            app.canvas.centerOnNode(currentHoveredNode);
                        }
                    } else if (highlightMethod === "Spotlight+") {
                        app.canvas.selectNode(currentHoveredNode);
                        if (animation) {
                            const originalX = app.canvas.ds.offset[0];
                            const originalY = app.canvas.ds.offset[1];
                            
                            app.canvas.centerOnNode(currentHoveredNode);
                            app.canvas.ds.scale = initialCanvasState.scale;
                            
                            const perfectTargetX = app.canvas.ds.offset[0];
                            const perfectTargetY = app.canvas.ds.offset[1];
                            
                            app.canvas.ds.offset[0] = originalX;
                            app.canvas.ds.offset[1] = originalY;
                            
                            smoothPanTo(perfectTargetX, perfectTargetY, duration);
                        } else {
                            app.canvas.centerOnNode(currentHoveredNode);
                            app.canvas.ds.scale = initialCanvasState.scale;
                        }
                    }
                    app.canvas.setDirty(true, true);
                }
            } else {
                hideOverlay(e, true);
                if (e.clientX <= 2 || e.clientY <= 2 || e.clientX >= window.innerWidth - 2 || e.clientY >= window.innerHeight - 2) {
                    hideOverlay(e);
                }
            }
        }, true);

        window.addEventListener("dragleave", (e) => {
            if (!e.relatedTarget) hideOverlay(e)
        }, true);

        window.addEventListener("drop", async (e) => {
            if (!isShowing || !enableOverlay) return;

            if (((shiftBehavior && !e.shiftKey) || (!shiftBehavior && e.shiftKey)) && isTargetZone) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
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
            overlay.style.opacity = "0"; 
            setTimeout(() => { hideOverlay(e) }, 300);
        }, true);
    }
});

app.registerExtension({
    name: "ComfyUI.PowerLoader.Previewer",
    setup() {
        const container = document.createElement("div");
        container.id = "custom-preview-container";
        Object.assign(container.style, {
            position: "fixed",
            zIndex: "9999",
            display: "none",
            pointerEvents: "none",
            transition: "opacity 0.2s ease-in-out",
            opacity: "0",
            width: "fit-content",
            height: "fit-content" 
        });
        
        const img = document.createElement("img");
        Object.assign(img.style, {
            objectFit: "contain",
            boxShadow: "0 4px 15px rgba(0, 0, 0, 0.5)",
            borderRadius: "10px",
            border: "2px solid rgba(255, 255, 255, 0.1)",
            display: "block",
            backgroundColor: "rgba(0, 0, 0, 0.3)"
        });
        
        const label = document.createElement("div");
        label.innerText = "PowerLoader Previewer";
        Object.assign(label.style, {
            position: "absolute",
            top: "8px", right: "8px",
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            color: "#ffffff",
            padding: "4px 8px",
            fontSize: "12px",
            fontFamily: "Arial, sans-serif",
            fontWeight: "bold",
            borderRadius: "5px",
            textShadow: "0 1px 2px rgba(0,0,0,0.8)",
            zIndex: "10",
            opacity: "0.8"
        });
        
        container.appendChild(img);
        container.appendChild(label); 
        document.body.appendChild(container);
        
        function updateStyle() {
            const sidebar = app.ui.settings.getSettingValue("Comfy.Sidebar.Location", "left");
            
            img.style.height = `calc((100vh - 120px) * ${previeweSize} / 100)`; 
            img.style.width = "auto";
            img.style.maxWidth = "90vw";
            container.style.top = "";
            container.style.bottom = "";
            container.style.left = "";
            container.style.right = "";
            
            switch (previewePos) {
                case "Bottom Left":
                    container.style.bottom = "20px";
                    container.style.left = sidebar === "left" ? "70px" : "20px";
                    break;
                case "Bottom Right":
                    container.style.bottom = "20px";
                    container.style.right = sidebar === "right" ? "70px" : "20px";
                    break;
                case "Top Left":
                    container.style.top = "100px"; 
                    container.style.left = sidebar === "left" ? "70px" : "20px";
                    break;
                case "Top Right":
                    container.style.top = "100px";
                    container.style.right = sidebar === "right" ? "70px" : "20px";
                    break;
            }
        };
        
        app.ui.settings.addSetting({
            id: "PowerLoader.Previewer.Size",
            category: ["PowerLoader", i18n.previewer, i18n.previewer_size],
            name: i18n.previewer_size,
            type: "slider",
            attrs: {min: 10, max: 100, step: 1},
            defaultValue: 50,
            onChange: (value) => {
                previeweSize = value;
                updateStyle();
            }
        });
        
        app.ui.settings.addSetting({
            id: "PowerLoader.Previewer.Position",
            category: ["PowerLoader", i18n.previewer, i18n.previewer_pos],
            name: i18n.previewer_pos,
            type: "combo",
            options: ["Bottom Left", "Bottom Right", "Top Left", "Top Right"],
            defaultValue: "Bottom Left",
            onChange: (value) => {
                previewePos = value;
                updateStyle();
            }
        });
        
        app.ui.settings.addSetting({
            id: "PowerLoader.Previewer.EnablePreviewer",
            category: ["PowerLoader", i18n.previewer, i18n.previewer],
            name: i18n.previewer,
            type: "boolean",
            defaultValue: true,
            onChange: (value) => { enablePreviewer = value }
        });
        
        updateStyle();
        
        let currentBlobUrl = null;
        
        api.addEventListener("b_preview", (event) => {
            if (!enablePreviewer) return;
            const blob = event.detail; 
            if (blob) {
                if (currentBlobUrl) {
                    URL.revokeObjectURL(currentBlobUrl);
                }
                currentBlobUrl = URL.createObjectURL(blob);
                img.src = currentBlobUrl;
                
                container.style.display = "block";
                setTimeout(() => { container.style.opacity = "1"; }, 10); 
            }
        });
        
        const hidePreview = () => {
            container.style.opacity = "0";
            setTimeout(() => {
                container.style.display = "none";
                img.src = "";
                if (currentBlobUrl) {
                    URL.revokeObjectURL(currentBlobUrl);
                    currentBlobUrl = null;
                }
            }, 200);
        };
        
        api.addEventListener("executing", (event) => {
            if (!event.detail) {
                hidePreview();
            } else {
                updateStyle();
            }
        });
        
        api.addEventListener("execution_interrupted", () => {
            hidePreview();
        });
    }
});
            