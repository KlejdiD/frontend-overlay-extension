const loadButton = document.getElementById("loadButton");
const toggleButton = document.getElementById("toggleButton");
const urlInput = document.getElementById("urlInput");
const iframe = document.getElementById("iframe");
const overlayImage = document.getElementById("overlayImage");
const opacitySlider = document.getElementById("opacitySlider");
const imageUpload = document.getElementById("imageUpload");
const interactionToggle = document.getElementById("interactionToggle");

let isDragging = false;
let offsetX = 0;
let offsetY = 0;
let iframeInteractive = false;

window.addEventListener("DOMContentLoaded", async () => {
  chrome.storage.local.get(["overlayURL", "overlayOpacity"], (result) => {
    if (result.overlayURL) {
      urlInput.value = result.overlayURL;
    }

    if (result.overlayOpacity) {
      opacitySlider.value = result.overlayOpacity;
      overlayImage.style.opacity = result.overlayOpacity;

      // Update existing overlay image on page (if present)
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (opacity) => {
            const iframe = document.getElementById("website-overlay");
            const img = document.getElementById("screenshot-overlay");
            if (iframe) iframe.style.opacity = opacity;
            if (img) img.style.opacity = opacity;
          },
          args: [result.overlayOpacity],
        });
      });
    }
  });
});

opacitySlider.addEventListener("input", async () => {
  overlayImage.style.opacity = opacitySlider.value;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (opacity) => {
      const iframe = document.getElementById("website-overlay");
      if (iframe) iframe.style.opacity = opacity;

      const img = document.getElementById("screenshot-overlay");
      if (img) img.style.opacity = opacity;

      chrome.storage.local.set({ overlayOpacity: opacitySlider.value });
    },
    args: [opacitySlider.value],
  });
});

// ✅ Toggle iframe interactivity (via pointer-events)
interactionToggle.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const iframe = document.getElementById("website-overlay");
      if (!iframe) return;

      const isInteractive = iframe.style.pointerEvents !== "none";
      iframe.style.pointerEvents = isInteractive ? "none" : "auto";

      // Optionally reflect the state in the page itself, e.g., label or tooltip
      iframe.setAttribute("data-interactive", !isInteractive);
    },
  });

  // Optionally update your button label in the extension popup
  iframeInteractive = !iframeInteractive;
  interactionToggle.innerText = iframeInteractive
    ? "Disable Website Interaction"
    : "Enable Website Interaction";
});

document.getElementById("loadButton").addEventListener("click", async () => {
  const url = document.getElementById("urlInput").value.trim();
  if (!url.startsWith("http")) {
    alert("Please enter a valid URL (e.g., https://example.com)");
    return;
  }

  // Get the current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Save the link
  chrome.storage.local.set({ overlayURL: url });

  // Inject the iframe directly
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (url) => {
      // Remove old overlay if it exists
      const oldOverlay = document.getElementById("website-overlay");
      if (oldOverlay) oldOverlay.remove();

      // Create full-screen iframe
      const iframe = document.createElement("iframe");
      iframe.id = "website-overlay";
      iframe.src = url;
      iframe.style = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483647;  // Max possible
        border: none;
        background: white;
        pointer-events: none;
      `;
      document.body.appendChild(iframe);
    },
    args: [url], // Pass the URL to the function
  });
});

toggleButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const iframe = document.getElementById("website-overlay");
      const img = document.getElementById("screenshot-overlay");

      if (iframe) {
        const isVisible = iframe.style.display !== "none";
        iframe.style.display = isVisible ? "none" : "block";
      }

      if (img) {
        const isVisible = img.style.display !== "none";
        img.style.display = isVisible ? "none" : "block";
      }
    },
  });
});

// 🎯 Upload your own image screenshot
imageUpload.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (event) {
    const dataUrl = event.target.result;

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (dataUrl, opacity) => {
        // Remove old image overlay if it exists
        const oldImage = document.getElementById("screenshot-overlay");
        if (oldImage) oldImage.remove();

        // Hide the iframe if it's active
        const iframe = document.getElementById("website-overlay");
        if (iframe) iframe.style.display = "none";

        // Create image overlay
        const img = document.createElement("img");
        img.id = "screenshot-overlay";
        img.src = dataUrl;
        img.style = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483647;
        object-fit: contain;
        object-position: center;
        opacity: 1;
        transition: opacity 0.2s ease;
        transform: translate(0, 0);
        `;
        document.body.appendChild(img);
      },
      args: [dataUrl, opacitySlider.value],
    });
  };

  reader.readAsDataURL(file);
});

// 🖱️ Drag-to-move overlay image
overlayImage.addEventListener("mousedown", (e) => {
  isDragging = true;
  offsetX = e.clientX - overlayImage.offsetLeft;
  offsetY = e.clientY - overlayImage.offsetTop;
});
document.addEventListener("mousemove", (e) => {
  if (isDragging) {
    overlayImage.style.left = `${e.clientX - offsetX}px`;
    overlayImage.style.top = `${e.clientY - offsetY}px`;
  }
});
document.addEventListener("mouseup", () => {
  isDragging = false;
});

const moveButtons = document.querySelectorAll("#screenshotControls button");
let moveStep = 2; // pixels per button press
let translateX = 0;
let translateY = 0;

moveButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const direction = btn.dataset.move;

    switch (direction) {
      case "up":
        translateY -= moveStep;
        break;
      case "down":
        translateY += moveStep;
        break;
      case "left":
        translateX -= moveStep;
        break;
      case "right":
        translateX += moveStep;
        break;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (x, y) => {
        const img = document.getElementById("screenshot-overlay");
        if (img) {
          img.style.transform = `translate(${x}px, ${y}px)`;
        }
      },
      args: [translateX, translateY],
    });
  });
});

const removeScreenshotButton = document.getElementById(
  "removeScreenshotButton"
);

removeScreenshotButton.addEventListener("click", async () => {
  translateX = 0;
  translateY = 0;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const img = document.getElementById("screenshot-overlay");
      if (img) {
        img.remove();
      }
    },
  });

  imageUpload.value = "";
});
