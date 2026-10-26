import type { ClipBeauty } from './types';

/**
 * 美肌：用 WebGL 在 GPU 上處理每一格畫面，預覽與匯出共用。
 * - 以膚色範圍（YCbCr）找出皮膚；磨皮在皮膚上全強度，其他地方較輕（彩色燈光下膚色會偏離範圍）
 * - 磨皮：保邊模糊（依顏色差加權），抹平膚質又不糊掉眼睛、頭髮與輪廓
 * - 美白：提亮皮膚；紅潤：讓膚色帶一點血色
 * 沒有臉部偵測，接近膚色的背景也可能被輕微柔化。
 */

export const BEAUTY_PRESETS: { id: string; name: string; value: ClipBeauty }[] = [
  { id: 'natural', name: '自然', value: { smooth: 35, whiten: 15, rosy: 10 } },
  { id: 'soft', name: '柔膚', value: { smooth: 65, whiten: 20, rosy: 10 } },
  { id: 'bright', name: '亮白', value: { smooth: 40, whiten: 50, rosy: 5 } },
  { id: 'rosy', name: '元氣', value: { smooth: 35, whiten: 20, rosy: 40 } },
];

export const isBeautyOn = (b?: ClipBeauty) => !!b && (b.smooth > 0 || b.whiten > 0 || b.rosy > 0);

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_radius;
uniform float u_smooth;
uniform float u_whiten;
uniform float u_rosy;
varying vec2 v_uv;

float skin(vec3 c) {
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  float cb = 0.564 * (c.b - y) + 0.5;
  float cr = 0.713 * (c.r - y) + 0.5;
  float m = smoothstep(0.27, 0.32, cb) * (1.0 - smoothstep(0.49, 0.54, cb));
  m *= smoothstep(0.50, 0.55, cr) * (1.0 - smoothstep(0.67, 0.72, cr));
  return m * smoothstep(0.12, 0.22, y);
}

void main() {
  vec3 c = texture2D(u_tex, v_uv).rgb;
  float mask = skin(c);
  vec3 sum = c;
  float wsum = 1.0;
  // 三圈、每圈 8 個方向的保邊模糊
  for (int i = 0; i < 24; i++) {
    float ring = float(i / 8) + 1.0;
    float a = float(i) * 0.785398 + ring * 0.39;
    vec2 off = vec2(cos(a), sin(a)) * u_texel * u_radius * ring;
    vec3 s = texture2D(u_tex, v_uv + off).rgb;
    vec3 d = s - c;
    // 顏色差越大權重越小（保留邊緣）；膚色樣本權重較高
    float w = exp(-dot(d, d) / 0.012) * (0.45 + 0.55 * skin(s));
    sum += s * w;
    wsum += w;
  }
  vec3 blurred = sum / wsum;
  // 打彩色燈時膚色可能偏離範圍，所以整個畫面都有基本強度的保邊磨皮，皮膚全強度
  float amount = u_smooth * mix(0.45, 1.0, mask);
  vec3 r = mix(c, blurred, clamp(amount, 0.0, 0.92));
  // 美白：只提亮、不改色相，皮膚為主、其他地方很輕微
  vec3 lifted = 1.0 - (1.0 - r) * (1.0 - r);
  r = mix(r, lifted, u_whiten * 0.55 * (0.25 + 0.75 * mask));
  // 紅潤：皮膚多一點紅、少一點綠
  r += vec3(0.07, -0.015, 0.0) * u_rosy * mask;
  gl_FragColor = vec4(clamp(r, 0.0, 1.0), 1.0);
}`;

let canvas: HTMLCanvasElement | null = null;
let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let texture: WebGLTexture | null = null;
let uniforms: Record<string, WebGLUniformLocation | null> = {};
let broken = false;

function setup() {
  if (gl || broken) return !!gl;
  canvas = document.createElement('canvas');
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl) {
    broken = true;
    return false;
  }
  const compile = (type: number, src: string) => {
    const s = gl!.createShader(type)!;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) ?? '美肌著色器編譯失敗');
    return s;
  };
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    for (const n of ['u_tex', 'u_texel', 'u_radius', 'u_smooth', 'u_whiten', 'u_rosy']) uniforms[n] = gl.getUniformLocation(program, n);
    return true;
  } catch (e) {
    console.warn(e);
    broken = true;
    gl = null;
    return false;
  }
}

/** 把 source 以 w×h 處理美肌，回傳處理後的畫布；無法處理（不支援 WebGL、跨網域圖片）時回傳原圖 */
export function applyBeauty(source: CanvasImageSource, w: number, h: number, b: ClipBeauty): CanvasImageSource {
  if (!isBeautyOn(b) || !setup() || !gl || !canvas) return source;
  try {
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    gl.uniform1i(uniforms.u_tex, 0);
    gl.uniform2f(uniforms.u_texel, 1 / w, 1 / h);
    // 模糊半徑跟著畫面大小走，720p、1080p 看起來一樣
    gl.uniform1f(uniforms.u_radius, Math.max(1.5, Math.min(w, h) * 0.0065));
    gl.uniform1f(uniforms.u_smooth, b.smooth / 100);
    gl.uniform1f(uniforms.u_whiten, b.whiten / 100);
    gl.uniform1f(uniforms.u_rosy, b.rosy / 100);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  } catch (e) {
    console.warn('美肌處理失敗，改用原圖', e);
    return source;
  }
}
