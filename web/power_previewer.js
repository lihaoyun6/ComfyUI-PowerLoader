import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

let i18n = {};
let baseI18n = {
    previewer: "Previewer",
    previewer_size: "Preview Size (%)",
    previewer_pos: "Preview Position",
    previewer_hover: "On Mouse Hover",
};

let isDodged = false;
let originalRect = null;
let dodgeMouseMoveHandler = null;
let currentBlobUrl = null;
let previeweSize = app.ui.settings.getSettingValue("PowerLoader.Previewer.Size");
let previewePos = app.ui.settings.getSettingValue("PowerLoader.Previewer.Position");
let enablePreviewer = app.ui.settings.getSettingValue("PowerLoader.Previewer.EnablePreviewer");
let previewerHover = app.ui.settings.getSettingValue("PowerLoader.Previewer.PreviewerHover");

const container = document.createElement("div");
container.id = "custom-preview-container";
Object.assign(container.style, {
    position: "fixed",
    zIndex: "9999",
    display: "none",
    transition: "opacity 0.2s ease-in-out",
    opacity: "0",
    pointerEvents: "auto",
});

const img = document.createElement("img");
Object.assign(img.style, {
    objectFit: "contain",
    boxShadow: "0 4px 15px rgba(0, 0, 0, 0.4)",
    borderRadius: "8px",
    border: "1px solid rgba(85, 85, 85, 0.65)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    gridArea: "1 / 1"
});

const labelWrapper = document.createElement("div");
Object.assign(labelWrapper.style, {
    gridArea: "1 / 1",
    alignSelf: "start",
    width: "100%",
    boxSizing: "border-box",
    padding: "6px",
    display: "flex",
    justifyContent: "space-between",
    gap: "6px",
    zIndex: "10"
});

const commonLabelStyle = {
    backgroundColor: "rgba(70, 70, 70, 0.65)",
    color: "#ffffff",
    padding: "4px 8px",
    fontSize: "12px",
    fontFamily: "Arial, sans-serif",
    fontWeight: "bold",
    borderRadius: "5px",
    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flexShrink: "1",
    minWidth: "0"
};
const titleLabel = document.createElement("div");
titleLabel.innerText = "PowerLoader Previewer";
Object.assign(titleLabel.style, commonLabelStyle);
titleLabel.style.textAlign = "left";

const stepLabel = document.createElement("div");
stepLabel.innerText = "-/-";
Object.assign(stepLabel.style, commonLabelStyle);

labelWrapper.appendChild(titleLabel);
labelWrapper.appendChild(stepLabel);
container.appendChild(labelWrapper); 
container.appendChild(img);
document.body.appendChild(container);

async function loadI18n() {
    const comfyLang = app.ui.settings.getSettingValue("Comfy.Locale");
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

function updateStyle() {
    let pos = previewePos;
    const sidebarPos = app.ui.settings.getSettingValue("Comfy.Sidebar.Location");
    const sidebarStyle = app.ui.settings.getSettingValue("Comfy.Sidebar.Style");
    
    if (previewerHover === "Move to Other Side") {
        if (isDodged) pos = pos.includes("Left") ? pos.replace("Left", "Right") : pos.replace("Right", "Left");
    } else if (previewerHover === "Hide Previewer") {
        if (isDodged) {
            img.style.opacity = "0";
            labelWrapper.style.opacity = "0";
            container.style.pointerEvents = "none";
        } else {
            img.style.opacity = "1";
            labelWrapper.style.opacity = "1";
            container.style.pointerEvents = "auto";
        }
    }
    
    img.style.width = "auto";
    img.style.maxWidth = "90vw";
    container.style.top = "";
    container.style.bottom = "";
    container.style.left = "";
    container.style.right = "";
    
    switch (pos) {
        case "Bottom Left":
            container.style.bottom = "5px";
            container.style.left = sidebarPos === "left" ? (sidebarStyle === "connected" ? "67px" : "58px") : "8px";
            img.style.height = `calc((100vh - 100px) * ${previeweSize} / 100)`; 
            break;
        case "Bottom Right":
            container.style.bottom = "58px";
            container.style.right = sidebarPos === "right" ? (sidebarStyle === "connected" ? "67px" : "58px") : "5px";
            img.style.height = `calc((100vh - 242px) * ${previeweSize} / 100)`; 
            break;
        case "Top Left":
            container.style.top = "93px"; 
            container.style.left = sidebarPos === "left" ? (sidebarStyle === "connected" ? "67px" : "58px") : "8px";
            img.style.height = `calc((100vh - 100px) * ${previeweSize} / 100)`; 
            break;
        case "Top Right":
            container.style.top = "184px";
            container.style.right = sidebarPos === "right" ? (sidebarStyle === "connected" ? "67px" : "58px") : "5px";
            img.style.height = `calc((100vh - 242px) * ${previeweSize} / 100)`; 
            break;
    }
}

app.registerExtension({
    name: "ComfyUI.PowerLoader.Previewer",
    
    async init() {
        await loadI18n();
        
        app.ui.settings.addSetting({
            id: "PowerLoader.Previewer.PreviewerHover",
            category: ["PowerLoader", i18n.previewer, i18n.previewer_hover],
            name: i18n.previewer_hover,
            type: "combo",
            options: ["Do Nothing", "Hide Previewer", "Move to Other Side"],
            defaultValue: "Move to Other Side",
            onChange: (value) => { previewerHover = value }
        });
        
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
            defaultValue: "Top Left",
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
    },
    
    async setup() {
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const currentWidth = entry.contentRect.width;
                
                if (currentWidth > 0 && currentWidth < 140) {
                    titleLabel.style.display = "none";
                }else if (currentWidth > 0 && currentWidth < 220) {
                    titleLabel.innerText = "Previewer";
                } else {
                    titleLabel.innerText = "PowerLoader Previewer";
                    titleLabel.style.display = "block";
                }
            }
        });
        resizeObserver.observe(img);
        
        updateStyle();
        
        api.addEventListener("b_preview", (event) => {
            if (!enablePreviewer) return;
            const blob = event.detail; 
            if (blob) {
                if (currentBlobUrl) {
                    URL.revokeObjectURL(currentBlobUrl);
                }
                currentBlobUrl = URL.createObjectURL(blob);
                img.src = currentBlobUrl;
                
                container.style.display = "inline-grid";
                setTimeout(() => { container.style.opacity = "1"; }, 10); 
            }
        });
        
        const hidePreview = () => {
            container.style.opacity = "0";
            setTimeout(() => {
                container.style.display = "none";
                img.src = "";
                stepLabel.innerText = "-/-";
                if (currentBlobUrl) {
                    URL.revokeObjectURL(currentBlobUrl);
                    currentBlobUrl = null;
                }
                if (isDodged) isDodged = false;
                container.style.pointerEvents = "auto";
            }, 100);
        };
        
        container.addEventListener("mouseenter", () => {
            if (isDodged) return;
            originalRect = container.getBoundingClientRect();
            isDodged = true; updateStyle();
            
            dodgeMouseMoveHandler = (e) => {
                const padding = 30; 
                const isOutsideX = e.clientX < originalRect.left - padding || e.clientX > originalRect.right + padding;
                const isOutsideY = e.clientY < originalRect.top - padding || e.clientY > originalRect.bottom + padding;
                
                if (isOutsideX || isOutsideY) {
                    isDodged = false; updateStyle();
                    document.removeEventListener("mousemove", dodgeMouseMoveHandler);
                    dodgeMouseMoveHandler = null;
                }
            };
            document.addEventListener("mousemove", dodgeMouseMoveHandler);
        });
        
        api.addEventListener("progress", (event) => {
            const { value, max } = event.detail;
            if (max > 0) {
                stepLabel.innerText = `${value}/${max}`;
            }
        });
        
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