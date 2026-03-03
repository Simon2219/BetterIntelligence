# ComfyUI Setup Guide

This guide covers setting up local AI image generation with ComfyUI for BetterIntelligence. Supports FLUX.2 Dev FP8 and Stable Diffusion checkpoints.

## Prerequisites

- **Python 3.10+** (3.13 tested)
- **Git**
- **NVIDIA GPU** with 8GB+ VRAM (12GB+ recommended for Flux2 FP8)
- **~35GB disk space** for FLUX.2 models (less for SD checkpoints)

## Setup Options

### Option A: Clone ComfyUI into BetterIntelligence

Clone ComfyUI into the project's `comfyui/` folder:

```powershell
cd S:\Projects\BetterIntelligence
git clone https://github.com/comfyanonymous/ComfyUI.git comfyui
```

Then follow the install steps below (Option A path).

### Option B: Use RealChat's ComfyUI (shared install)

If you have RealChat with ComfyUI already set up, point BetterIntelligence to it:

In `.env`:

```
COMFYUI_PATH=../RealChat/RealChat/comfyui
```

Or absolute path:

```
COMFYUI_PATH=S:\Projects\RealChat\RealChat\comfyui
```

Ensure **RealChat is not running** when BetterIntelligence starts ComfyUI (both use port 8188 by default).

## Install (Option A only)

If you cloned ComfyUI into `./comfyui`:

```powershell
cd S:\Projects\BetterIntelligence\comfyui
pip install -r requirements.txt
```

**PyTorch with CUDA**: The default `pip install` may install CPU-only PyTorch. For GPU you **must** install the CUDA build:

```powershell
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
```

Verify GPU: `python -c "import torch; print('CUDA:', torch.cuda.is_available())"` → should print `CUDA: True`.

## Download Models

### FLUX.2 Dev FP8 (recommended)

Requires ~35GB total:

```powershell
cd S:\Projects\BetterIntelligence\comfyui
python download_flux2_models.py
```

Downloads to `models/text_encoders/`, `models/diffusion_models/`, `models/vae/`.

### Stable Diffusion (alternative)

Place checkpoint files (e.g. `dreamshaper_8.safetensors`) in `comfyui/models/checkpoints/`.

## Start BetterIntelligence

With `COMFYUI_START_WITH_SERVER=1` in `.env`, ComfyUI starts automatically:

```powershell
cd S:\Projects\BetterIntelligence
npm start
```

ComfyUI is spawned as a subsystem. Startup may take 30–60 seconds. Server logs show `[comfyui]` output.

**Manual ComfyUI**: Set `COMFYUI_START_WITH_SERVER=0` and run ComfyUI separately before starting the server.

## Verify

- Agent Builder → Model step → **Image AI** should show ComfyUI as "online"
- Chat with an agent that has an image provider; ask it to generate an image

## Configuration

| Variable | Description |
|----------|-------------|
| `COMFYUI_URL` | ComfyUI API URL (default: `http://localhost:8188`) |
| `COMFYUI_MODEL` | Model filename (e.g. `flux2_dev_fp8mixed.safetensors`, `dreamshaper_8.safetensors`) |
| `COMFYUI_PATH` | Path to ComfyUI directory (default: `./comfyui`) |
| `COMFYUI_START_WITH_SERVER` | `1` = start with server (default), `0` = manual |
| `COMFYUI_VRAM_MODE` | `lowvram` \| `novram` \| `normal` (default: `lowvram`) |

## Troubleshooting

### "ComfyUI main.py not found"
- ComfyUI is not at the expected path. Clone into `./comfyui` or set `COMFYUI_PATH` in `.env`.
- If using RealChat's ComfyUI: `COMFYUI_PATH=../RealChat/RealChat/comfyui`

### "ComfyUI not reachable"
- Ensure ComfyUI has finished starting (30–60s after server start)
- Check no other process uses port 8188 (e.g. RealChat)
- Verify `COMFYUI_URL` matches the port ComfyUI listens on

### ComfyUI won't start / "Torch not compiled with CUDA"
- Reinstall PyTorch with CUDA: `pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124`
- Run `nvidia-smi` to confirm the GPU is visible

### Model not found
- Run `download_flux2_models.py` (FLUX.2) or place checkpoint in `models/checkpoints/`

### Out of memory
- Set `COMFYUI_VRAM_MODE=lowvram` (or `novram` for CPU-only)
- Reduce image size in agent metadata (e.g. 768×768)
