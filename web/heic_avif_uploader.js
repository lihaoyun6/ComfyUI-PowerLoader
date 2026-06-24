import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

let toastHideTimeout = null;
const PASTED_IMAGE_EXPIRY_MS = 2000;

let i18n = {};
let baseI18n = {
    general: "General",
    quickpaste: "Quick Paste",
    quickpaste_tip: "Automatically rename clipboard items for faster pasting.",
    convert_to: "Convert HEIC/AVIF to",
    upload_failed: "Upload Failed! ",
    upload_success: "Upload Successful",
    upload_avif: "Uploading AVIF Image...",
    upload_heic: "Uploading HEIC Image...",
    upload_heif: "Uploading HEIF Image...",
};

const isPastedFile = (file) =>
    file.name === 'image.png' &&
    file.lastModified - Date.now() < PASTED_IMAGE_EXPIRY_MS;

function showMessage(text, type = 'info') {
    let container = document.getElementById('comfyui-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'comfyui-toast-container';
        Object.assign(container.style, {
            position: 'fixed',
            top: '50px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '9999',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            pointerEvents: 'none'
        });
        document.body.appendChild(container);
    }
    
    const themes = {
        info: { 
            bg: 'rgba(234, 179, 8, 0.25)',
            border: 'rgba(234, 179, 8, 0.4)'
        },
        success: { 
            bg: 'rgba(34, 197, 94, 0.25)',
            border: 'rgba(34, 197, 94, 0.4)'
        },
        error: { 
            bg: 'rgba(239, 68, 68, 0.25)',
            border: 'rgba(239, 68, 68, 0.4)'
        }
    };
    const theme = themes[type] || themes.info;
    
    let toast = document.getElementById('comfyui-single-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'comfyui-single-toast';
        Object.assign(toast.style, {
            color: '#ffffff',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: '12px 24px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            fontFamily: 'sans-serif',
            fontSize: '14px',
            fontWeight: 'bold',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            opacity: '0',
            transform: 'translateY(-20px)',
            transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)'
        });
        container.appendChild(toast);
    }
    
    toast.style.backgroundColor = theme.bg;
    toast.style.border = `1px solid ${theme.border}`;
    toast.textContent = text;
    
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });
    
    if (toastHideTimeout) clearTimeout(toastHideTimeout);
    
    toastHideTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
    }, 2500);
}

function loadHeic2Any() {
    if (window.heic2any) return Promise.resolve(window.heic2any);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('./heic2any/heic2any.min.js', import.meta.url).href;
        script.onload = () => resolve(window.heic2any);
        script.onerror = () => {
            console.error("Failed to load heic2any script!");
            reject(new Error("HEIC decoding library failed to load!"));
        };
        document.head.appendChild(script);
    });
}

function convertAvif(file, mimeType='image/png', ext='.png') {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(url);
                if (blob) {
                    const newName = file.name.replace(/\.avif$/i, ext);
                    resolve(new File([blob], newName, { type: mimeType }));
                } else {
                    console.error(`Failed to export image from canvas!`);
                    reject(new Error(`Failed to convert AVIF!`));
                }
            }, mimeType);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Your browser doesn't support the AVIF format!"));
        };
        img.src = url;
    });
}

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

app.registerExtension({
    name: "PowerLoader.FrontendFormatConverter",
    async setup() {
        await loadI18n();
        
        app.ui.settings.addSetting({
            id: "PowerLoader.HEIC_AVIF_Convert",
            category: ["PowerLoader", i18n.general, i18n.convert_to],
            name: i18n.convert_to,
            type: "combo",
            options: ["PNG", "JPG"],
            defaultValue: "PNG"
        });
        
        app.ui.settings.addSetting({
            id: "PowerLoader.Quick_Paste",
            category: ["PowerLoader", i18n.general, i18n.quickpaste],
            name: i18n.quickpaste,
            type: "boolean",
            defaultValue: false,
            tooltip: i18n.quickpaste_tip
        });
        
        const originalGetAsFile = DataTransferItem.prototype.getAsFile;
        DataTransferItem.prototype.getAsFile = function() {
            const file = originalGetAsFile.call(this);
            const quickPaste = app.ui.settings.getSettingValue("PowerLoader.Quick_Paste", false);
            if (quickPaste && file.type === 'image/png' && file.name === 'image.png' && isPastedFile(file)) {
                const uniqueName = `pasted/image_${Date.now()}.png`;
                return new File([file], uniqueName, { type: file.type });
            }
            return file;
        };
        
        const originalFetchApi = api.fetchApi;
        api.fetchApi = async function(route, options) {
            if ((route === "/upload/image" || route === "/upload/mask") && options && options.body instanceof FormData) {
                const file = options.body.get("image");
                if (file && file instanceof File) {
                    const ext = file.name.split('.').pop().toLowerCase();
                    try {
                        const targetFormat = app.ui.settings.getSettingValue("PowerLoader.HEIC_AVIF_Convert", "PNG");
                        const mimeType = targetFormat === "JPG" ? "image/jpeg" : "image/png";
                        const newExt = targetFormat === "JPG" ? ".jpg" : ".png";
                        
                        if (ext === 'heic' || ext === 'heif') {
                            if (ext === 'heic') showMessage(i18n.upload_heic, "info");
                            if (ext === 'heif') showMessage(i18n.upload_heif, "info");
                            const h2a = await loadHeic2Any();
                            const blobResult = await h2a({ blob: file, toType: mimeType});
                            const blob = Array.isArray(blobResult) ? blobResult[0] : blobResult;
                            const newFile = new File([blob], file.name.replace(/\.hei[cf]$/i, newExt), { type: mimeType });
                            options.body.set("image", newFile);
                            showMessage(i18n.upload_success, "success");
                        } 
                        else if (ext === 'avif') {
                            showMessage(i18n.upload_avif, "info");
                            const newFile = await convertAvif(file, mimeType, newExt);
                            options.body.set("image", newFile);
                            showMessage(i18n.upload_success, "success");
                        }
                    } catch (e) {
                        console.error("Unable to convert image:", e);
                        showMessage(i18n.upload_failed + e.message, "error");
                    }
                }
            }
            return originalFetchApi.apply(this, arguments);
        };

        const originalClick = HTMLInputElement.prototype.click;
        HTMLInputElement.prototype.click = function() {
            if (this.type === 'file' && typeof this.accept === 'string') {
                const acceptStr = this.accept.toLowerCase();
                
                const hasImage = acceptStr.includes("image/") || acceptStr.includes(".jpg") || acceptStr.includes(".png");
                const hasVideo = acceptStr.includes("video/") || acceptStr.includes(".mp4") || acceptStr.includes(".webm");
                const hasAudio = acceptStr.includes("audio/");
                
                if (hasImage && !hasVideo && !hasAudio) {
                    if (!acceptStr.includes(".heic")) {
                        this.accept += ",.heic,.heif,.avif,image/heic,image/heif,image/avif";
                    }
                }
            }
            return originalClick.apply(this, arguments);
        };
    }
});