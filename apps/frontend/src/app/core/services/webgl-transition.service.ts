import { Injectable } from '@angular/core';
import * as THREE from 'three';

export type WebGLTransitionType = 'disintegrate' | 'morph' | 'wave' | 'pixelate' | 'directionalWipe' | 'noise' | 'circle';

@Injectable({ providedIn: 'root' })
export class WebGLTransitionService {
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private mesh!: THREE.Mesh;
  private material!: THREE.ShaderMaterial;
  private animationId: number | null = null;
  private onComplete: (() => void) | null = null;
  private startTime = 0;
  private duration = 1500;
  private canvas: HTMLCanvasElement | null = null;
  private capturePixelRatio = 1;

  /**
   * Initialize the WebGL transition with two slide images
   */
  async initTransition(
    container: HTMLElement,
    fromElement: HTMLElement,
    toElement: HTMLElement,
    type: WebGLTransitionType = 'disintegrate'
  ): Promise<void> {
    // Capture both slides as images with high fidelity options
    const { toCanvas } = await import('html-to-image');

    // Use 2x resolution for crisp text rendering
    const pixelRatio = 2;
    const captureOptions = {
      width: 960,  // Logical width
      height: 600, // Logical height
      pixelRatio: pixelRatio, // This creates a 1920x1200 canvas internally
      cacheBust: true,
      skipFonts: false,
      filter: (node: HTMLElement) => {
        if (node.tagName === 'SCRIPT') return false;
        return true;
      },
    };

    const [fromCanvas, toCanvas_] = await Promise.all([
      toCanvas(fromElement, captureOptions),
      toCanvas(toElement, captureOptions)
    ]);

    // Store pixel ratio for texture setup
    this.capturePixelRatio = pixelRatio;

    // Create WebGL canvas at higher resolution for crisp rendering
    this.canvas = document.createElement('canvas');
    this.canvas.width = 960 * pixelRatio;
    this.canvas.height = 600 * pixelRatio;
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 960px;
      height: 600px;
      z-index: 100;
      pointer-events: none;
    `;
    container.appendChild(this.canvas);

    // Setup Three.js with high-res rendering
    this.setupScene(fromCanvas, toCanvas_, type);
  }

  /**
   * Simpler init that takes pre-captured canvases
   */
  async initWithCapture(
    container: HTMLElement,
    slideElement: HTMLElement,
    type: WebGLTransitionType = 'disintegrate'
  ): Promise<HTMLCanvasElement> {
    const { toCanvas } = await import('html-to-image');
    const capturedCanvas = await toCanvas(slideElement, { width: 960, height: 600, pixelRatio: 1 });

    // Store for later use
    this.canvas = document.createElement('canvas');
    this.canvas.width = 960;
    this.canvas.height = 600;
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 960px;
      height: 600px;
      z-index: 100;
      pointer-events: none;
    `;
    container.appendChild(this.canvas);

    return capturedCanvas;
  }

  /**
   * Setup the transition with from/to textures
   */
  setupTransition(fromCanvas: HTMLCanvasElement, toCanvas: HTMLCanvasElement, type: WebGLTransitionType) {
    this.setupScene(fromCanvas, toCanvas, type);
  }

  private setupScene(fromCanvas: HTMLCanvasElement, toCanvas: HTMLCanvasElement, type: WebGLTransitionType): void {
    this.scene = new THREE.Scene();

    // Orthographic camera for 2D
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    this.camera.position.z = 1;

    const pr = this.capturePixelRatio;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas!,
      alpha: true,
      antialias: false, // Disable antialiasing for crisper output
    });
    this.renderer.setSize(960 * pr, 600 * pr, false); // false = don't update style

    // Create textures from canvases with crisp filtering
    const texture1 = new THREE.CanvasTexture(fromCanvas);
    const texture2 = new THREE.CanvasTexture(toCanvas);
    // Use LinearFilter for smooth scaling but ensure textures are high-res
    texture1.minFilter = THREE.LinearFilter;
    texture1.magFilter = THREE.LinearFilter;
    texture1.generateMipmaps = false;
    texture2.minFilter = THREE.LinearFilter;
    texture2.magFilter = THREE.LinearFilter;
    texture2.generateMipmaps = false;

    // Get shader for the transition type
    const { vertexShader, fragmentShader } = this.getShaders(type);

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        texture1: { value: texture1 },
        texture2: { value: texture2 },
        progress: { value: 0 },
        resolution: { value: new THREE.Vector2(960 * pr, 600 * pr) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
    });

    // Create plane geometry covering the view
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);

    // Initial render
    this.renderer.render(this.scene, this.camera);
  }

  private getShaders(type: WebGLTransitionType): { vertexShader: string; fragmentShader: string } {
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    let fragmentShader: string;

    switch (type) {
      case 'disintegrate':
        // Noise-based dissolve effect
        fragmentShader = `
          uniform sampler2D texture1;
          uniform sampler2D texture2;
          uniform float progress;
          uniform vec2 resolution;
          varying vec2 vUv;

          // Simplex noise function
          vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

          float snoise(vec2 v) {
            const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
            vec2 i  = floor(v + dot(v, C.yy));
            vec2 x0 = v - i + dot(i, C.xx);
            vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod289(i);
            vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
            m = m*m; m = m*m;
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
            m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
            vec3 g;
            g.x = a0.x * x0.x + h.x * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
          }

          void main() {
            vec4 color1 = texture2D(texture1, vUv);
            vec4 color2 = texture2D(texture2, vUv);

            float noise = snoise(vUv * 8.0) * 0.5 + 0.5;
            float threshold = progress * 1.2;
            float edge = smoothstep(threshold - 0.1, threshold, noise);

            gl_FragColor = mix(color2, color1, edge);
          }
        `;
        break;

      case 'morph':
        // Distortion morph effect
        fragmentShader = `
          uniform sampler2D texture1;
          uniform sampler2D texture2;
          uniform float progress;
          varying vec2 vUv;

          void main() {
            float p = progress;
            float delayValue = p * 7.0 - vUv.y * 2.0 + vUv.x - 2.0;
            delayValue = clamp(delayValue, 0.0, 1.0);

            vec2 translateValue = vec2(p) + delayValue * 0.2;
            vec2 translateValue1 = vec2(-0.5, 1.0) * translateValue;
            vec2 translateValue2 = vec2(-0.5, 1.0) * (translateValue - 1.0 - delayValue * 0.1);

            vec2 uv1 = vUv + translateValue1;
            vec2 uv2 = vUv + translateValue2;

            vec4 color1 = texture2D(texture1, uv1);
            vec4 color2 = texture2D(texture2, uv2);

            float mixer = step(delayValue, 0.5);
            gl_FragColor = mix(color2, color1, mixer);
          }
        `;
        break;

      case 'wave':
        // Wave distortion effect
        fragmentShader = `
          uniform sampler2D texture1;
          uniform sampler2D texture2;
          uniform float progress;
          varying vec2 vUv;

          void main() {
            float p = progress;
            // Smooth transition from left to right
            float x = smoothstep(0.0, 1.0, (p * 2.0 + vUv.x - 1.0));

            vec2 uv1 = vUv;
            vec2 uv2 = vUv;

            // Wave amplitude: 0 at start, peaks in middle, 0 at end
            float waveAmp = 0.08;
            float envelope = sin(p * 3.14159); // 0 -> 1 -> 0
            float wave = sin(vUv.y * 15.0 + p * 8.0) * waveAmp * envelope;

            uv1.x += wave * (1.0 - x);
            uv2.x += wave * x;

            vec4 color1 = texture2D(texture1, uv1);
            vec4 color2 = texture2D(texture2, uv2);

            gl_FragColor = mix(color1, color2, x);
          }
        `;
        break;

      case 'pixelate':
        // Pixelation transition
        fragmentShader = `
          uniform sampler2D texture1;
          uniform sampler2D texture2;
          uniform float progress;
          uniform vec2 resolution;
          varying vec2 vUv;

          void main() {
            float p = progress;
            float pixels = 100.0 * (1.0 - abs(p - 0.5) * 2.0) + 1.0;

            vec2 pixelUv = floor(vUv * pixels) / pixels;

            vec4 color1 = texture2D(texture1, pixelUv);
            vec4 color2 = texture2D(texture2, pixelUv);

            float mixer = smoothstep(0.4, 0.6, p);
            gl_FragColor = mix(color1, color2, mixer);
          }
        `;
        break;

      case 'directionalWipe':
        // Directional wipe with soft edge
        fragmentShader = `
          uniform sampler2D texture1;
          uniform sampler2D texture2;
          uniform float progress;
          varying vec2 vUv;

          void main() {
            vec2 direction = vec2(1.0, -0.5);
            vec2 p = vUv + progress * sign(direction);
            vec2 f = fract(p);

            float m = smoothstep(0.0, 0.05, f.x) * smoothstep(1.0, 0.95, f.x);
            m *= smoothstep(0.0, 0.05, f.y) * smoothstep(1.0, 0.95, f.y);

            vec4 color1 = texture2D(texture1, vUv);
            vec4 color2 = texture2D(texture2, vUv);

            float edge = smoothstep(0.0, 0.1, progress - (1.0 - vUv.x) * 0.5 - vUv.y * 0.5);

            gl_FragColor = mix(color1, color2, edge);
          }
        `;
        break;

      case 'noise':
      default:
        // Perlin noise dissolve
        fragmentShader = `
          uniform sampler2D texture1;
          uniform sampler2D texture2;
          uniform float progress;
          varying vec2 vUv;

          // Hash function
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          // Value noise
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);

            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));

            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          void main() {
            vec4 color1 = texture2D(texture1, vUv);
            vec4 color2 = texture2D(texture2, vUv);

            float n = noise(vUv * 10.0);
            n += noise(vUv * 20.0) * 0.5;
            n += noise(vUv * 40.0) * 0.25;
            n = n / 1.75;

            float p = progress * 1.2;
            float edge = smoothstep(p - 0.1, p + 0.1, n);

            gl_FragColor = mix(color2, color1, edge);
          }
        `;
        break;

      case 'circle':
        // Circular reveal with noise distortion (based on Codrops demo3)
        fragmentShader = `
          uniform sampler2D texture1;
          uniform sampler2D texture2;
          uniform float progress;
          uniform vec2 resolution;
          varying vec2 vUv;

          // Simple noise function
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          void main() {
            vec2 uv = vUv;
            vec2 center = vec2(0.5, 0.5);

            // Account for aspect ratio
            vec2 aspect = vec2(resolution.x / resolution.y, 1.0);

            // Add subtle noise to the edge for organic look
            float n = noise(vUv * 8.0 + progress * 3.0);
            float noiseOffset = (n - 0.5) * 0.06;

            // Calculate distance from center with aspect correction
            float dist = distance(center * aspect, uv * aspect);

            // Width of the soft edge
            float width = 0.12;

            // Max radius needs to reach the corners (diagonal distance ~0.85 with aspect)
            float maxRadius = 1.0;

            // Current radius based on progress (0 to maxRadius)
            float currentRadius = progress * maxRadius + noiseOffset;

            // Circular mask with soft edge
            float circ = smoothstep(currentRadius - width, currentRadius + width, dist);
            circ = 1.0 - circ;

            // Apply slight zoom effect during transition
            float zoomAmount = 0.05;
            vec2 uv1 = (uv - 0.5) * (1.0 - circ * zoomAmount) + 0.5;
            vec2 uv2 = (uv - 0.5) * (1.0 + (1.0 - circ) * zoomAmount) + 0.5;

            vec4 color1 = texture2D(texture1, uv1);
            vec4 color2 = texture2D(texture2, uv2);

            gl_FragColor = mix(color1, color2, circ);
          }
        `;
        break;
    }

    return { vertexShader, fragmentShader };
  }

  /**
   * Start the transition animation
   */
  animate(duration: number = 1500): Promise<void> {
    return new Promise((resolve) => {
      this.duration = duration;
      this.startTime = performance.now();
      this.onComplete = resolve;
      this.animationLoop();
    });
  }

  private animationLoop = (): void => {
    const elapsed = performance.now() - this.startTime;
    const progress = Math.min(elapsed / this.duration, 1);

    // Ease in-out cubic
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    this.material.uniforms['progress'].value = eased;
    this.renderer.render(this.scene, this.camera);

    if (progress < 1) {
      this.animationId = requestAnimationFrame(this.animationLoop);
    } else {
      this.cleanup();
      if (this.onComplete) {
        this.onComplete();
      }
    }
  };

  show(): void {
    // No-op for compatibility, canvas is visible by default now
  }

  /**
   * Clean up WebGL resources
   */
  cleanup(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.scene.remove(this.mesh);
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }

    this.canvas = null;
  }
}
