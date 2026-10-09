// =====================================================================
//  WebGL2 renderer: physically-inspired materials, soft shadows,
//  procedural sky, and an HDR post-processing chain (MSAA, ambient
//  occlusion, bloom, macro depth of field, colour grading).
// =====================================================================
'use strict';

const GLSL_NOISE = `
float h3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { return vn3(p) * 0.55 + vn3(p * 2.03 + 7.1) * 0.3 + vn3(p * 4.07 + 3.3) * 0.15; }
`;

const LIT_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec3 a_col;
layout(location=3) in vec2 a_uv;
layout(location=4) in vec4 i_m0;
layout(location=5) in vec4 i_m1;
layout(location=6) in vec4 i_m2;
layout(location=7) in vec4 i_m3;
layout(location=8) in vec4 i_tint;
uniform mat4 u_vp, u_lightVP;
uniform float u_time, u_wind;
out vec3 v_wpos; out vec3 v_nrm; out vec3 v_col; out vec2 v_uv; out vec4 v_lpos;
void main() {
  mat4 M = mat4(i_m0, i_m1, i_m2, i_m3);
  vec3 p = a_pos;
  if (u_wind > 0.0) {
    vec3 o = i_m3.xyz;
    float h = max(0.0, a_pos.y);
    float gust = 0.6 + 0.4 * sin(u_time * 0.35 + o.x * 0.05 + o.z * 0.03);
    float s = (sin(u_time * 1.6 + o.x * 0.7 + o.z * 0.45) + 0.5 * sin(u_time * 2.7 + o.z * 1.3)) * gust;
    p.x += s * 0.12 * h * h * u_wind;
    p.z += cos(u_time * 1.2 + o.x * 0.9) * 0.06 * h * h * u_wind;
  }
  vec4 w = M * vec4(p, 1.0);
  v_wpos = w.xyz;
  v_nrm = mat3(M) * a_nrm;
  v_col = a_col * i_tint.rgb;
  v_uv = a_uv;
  v_lpos = u_lightVP * w;
  gl_Position = u_vp * w;
}`;

const LIT_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 v_wpos; in vec3 v_nrm; in vec3 v_col; in vec2 v_uv; in vec4 v_lpos;
uniform vec3 u_lightDir, u_lightCol, u_sky, u_ground, u_fogCol, u_camPos, u_tintMul, u_bumpScale;
uniform float u_fogNear, u_fogFar, u_spec, u_shin, u_emis, u_alpha, u_cut, u_rim, u_coat, u_trans, u_bump, u_snow, u_time;
uniform sampler2D u_tex; uniform int u_useTex;
uniform sampler2DShadow u_shadow; uniform int u_useShadow; uniform float u_shadowTexel; uniform int u_pcf;
uniform sampler2D u_fow; uniform sampler2D u_terr; uniform sampler2D u_canopy; uniform int u_useMap; uniform vec2 u_mapSize;
uniform int u_hdr;
out vec4 o;
${GLSL_NOISE}
const vec2 PD[16] = vec2[](vec2(-0.942,-0.399), vec2(0.946,-0.769), vec2(-0.094,-0.929), vec2(0.345,0.294),
  vec2(-0.916,0.458), vec2(-0.815,-0.879), vec2(-0.383,0.277), vec2(0.975,0.756), vec2(0.443,-0.975), vec2(0.538,-0.474),
  vec2(-0.265,-0.419), vec2(0.792,0.191), vec2(-0.242,0.997), vec2(-0.814,0.914), vec2(0.200,0.786), vec2(0.144,-0.141));
float shadowF(vec3 n) {
  vec3 p = v_lpos.xyz / v_lpos.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float b = 0.0009 + 0.0022 * (1.0 - abs(dot(n, u_lightDir)));
  float a = h3(v_wpos * 31.7) * 6.2832;
  mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
  float s = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= u_pcf) break;
    s += texture(u_shadow, vec3(p.xy + R * PD[i] * u_shadowTexel * 2.4, p.z - b));
  }
  return s / float(u_pcf);
}
vec3 aces(vec3 c) { return clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec4 tx = vec4(1.0);
  if (u_useTex == 1) { tx = texture(u_tex, v_uv); if (tx.a < u_cut) discard; }
  vec3 n = normalize(v_nrm);
  if (!gl_FrontFacing) n = -n;
  vec3 base = v_col * tx.rgb * u_tintMul;
  float hb = 0.5;
  if (u_bump > 0.0) {
    // procedural micro-relief: bump the normal with world-space noise
    hb = fbm3(v_wpos * u_bumpScale);
    float amp = u_bump * 0.6 / max(u_bumpScale.x, 0.01);
    vec3 dpdx = dFdx(v_wpos), dpdy = dFdy(v_wpos);
    float dhx = dFdx(hb) * amp, dhy = dFdy(hb) * amp;
    vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
    float det = dot(dpdx, r1);
    vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
    vec3 nb = abs(det) * n - grad;
    if (dot(nb, nb) > 1e-12) n = normalize(nb);
    base *= 0.8 + 0.4 * hb;
  }
  float snow = u_snow * smoothstep(0.5, 0.9, n.y + (hb - 0.5) * 0.6);
  base = mix(base, vec3(0.84, 0.88, 0.95), snow);
  float ndlRaw = dot(n, u_lightDir), ndl = max(ndlRaw, 0.0);
  float sh = (u_useShadow == 1) ? shadowF(n) : 1.0;
  if (u_useMap == 1) {
    float cm = texture(u_canopy, v_wpos.xz / u_mapSize).r;
    if (cm > 0.02) {
      float d = smoothstep(0.38, 0.62, fbm3(vec3(v_wpos.xz * 0.75, u_time * 0.05)));
      sh *= mix(1.0, 0.25 + 0.75 * d, cm * 0.9);
    }
  }
  vec3 hemi = mix(u_ground, u_sky, n.y * 0.5 + 0.5);
  vec3 V = normalize(u_camPos - v_wpos);
  vec3 Hh = normalize(u_lightDir + V);
  float ndh = max(dot(n, Hh), 0.0), vdh = max(dot(V, Hh), 0.0);
  float F = 0.04 + 0.96 * pow(1.0 - vdh, 5.0);
  float spec = pow(ndh, u_shin) * (u_shin + 8.0) / 48.0 * u_spec * (0.35 + 0.65 * F) * ndl * sh;
  float coat = pow(ndh, 260.0) * u_coat * 5.0 * ndl * sh * (0.25 + 0.75 * F);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * u_rim;
  float tr = u_trans * (pow(max(dot(V, -u_lightDir), 0.0), 4.0) * 1.3 + max(-ndlRaw, 0.0) * 0.4) * sh;
  float spAmt = 1.0 + snow * 0.6;
  vec3 col = base * (hemi + u_lightCol * (ndl * sh + tr)) + u_lightCol * (spec * spAmt + coat) + base * u_emis + u_sky * rim;
  if (u_useMap == 1) {
    vec2 tc = v_wpos.xz / u_mapSize;
    vec4 t = texture(u_terr, tc);
    if (t.a > 0.01) {
      col = mix(col, t.rgb * 0.8, 0.14);
      float e = 0.0;
      vec2 d = vec2(0.1) / u_mapSize;
      vec4 a1 = texture(u_terr, tc + vec2(d.x, 0.0)), a2 = texture(u_terr, tc - vec2(d.x, 0.0));
      vec4 a3 = texture(u_terr, tc + vec2(0.0, d.y)), a4 = texture(u_terr, tc - vec2(0.0, d.y));
      if (distance(a1, t) > 0.01 || distance(a2, t) > 0.01 || distance(a3, t) > 0.01 || distance(a4, t) > 0.01) e = 1.0;
      col = mix(col, t.rgb * 1.35 + 0.1, e * 0.85);
    }
    float f = texture(u_fow, tc).a;
    col *= 1.0 - f * 0.96;
  }
  float fogF = smoothstep(u_fogNear, u_fogFar, length(u_camPos - v_wpos));
  if (u_hdr == 1) col = mix(col, u_fogCol, fogF);
  else col = mix(aces(col * 1.05), u_fogCol, fogF);
  o = vec4(col, u_alpha * tx.a);
}`;

const DEPTH_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex; uniform int u_useTex; uniform float u_cut;
in vec2 v_uv;
out vec4 o;
void main() { if (u_useTex == 1 && texture(u_tex, v_uv).a < u_cut) discard; o = vec4(1.0); }`;

const WATER_FS = `#version 300 es
precision highp float;
in vec3 v_wpos; in vec3 v_nrm; in vec3 v_col; in vec2 v_uv; in vec4 v_lpos;
uniform vec3 u_lightDir, u_lightCol, u_sky, u_fogCol, u_camPos;
uniform float u_time, u_fogNear, u_fogFar;
uniform sampler2D u_fow; uniform int u_useMap; uniform vec2 u_mapSize; uniform int u_hdr;
out vec4 o;
${GLSL_NOISE}
vec3 aces(vec3 c) { return clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 p = v_wpos.xz;
  float depth = v_col.r;                       // 0 at the shore, 1 in deep water
  float wd = length(u_camPos - v_wpos), calm = 1.0 - smoothstep(8.0, 45.0, wd);
  float a = sin(p.x * 3.1 + u_time * 1.3) * 0.5 + sin(p.y * 2.3 - u_time * 1.1) * 0.5 + sin((p.x + p.y) * 5.7 + u_time * 2.1) * 0.25;
  float b = cos(p.y * 3.7 + u_time * 1.2) * 0.5 + cos((p.x - p.y) * 4.3 - u_time * 1.7) * 0.3;
  float ripple = vn3(vec3(p * 9.0, u_time * 0.8)) - 0.5;
  vec3 n = normalize(vec3((a * 0.05 + ripple * 0.06) * calm, 1.0, (b * 0.05 + ripple * 0.05) * calm));
  vec3 V = normalize(u_camPos - v_wpos);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 deep = vec3(0.03, 0.10, 0.13), shallow = vec3(0.16, 0.30, 0.28);
  vec3 col = mix(shallow, deep, smoothstep(0.0, 0.9, depth));
  // sky reflection
  vec3 R = reflect(-V, n);
  vec3 skyR = mix(u_fogCol * 0.8, u_sky * 1.1, smoothstep(0.0, 0.6, R.y));
  col = mix(col, skyR, clamp(fres * 1.1, 0.0, 0.6));
  vec3 Hh = normalize(u_lightDir + V);
  vec3 ng = normalize(n + vec3(vn3(vec3(p * 23.0, u_time * 1.7)) - 0.5, 0.0, vn3(vec3(p * 23.0 + 17.0, u_time * 1.5)) - 0.5) * 0.35);
  float env = pow(max(dot(n, Hh), 0.0), 120.0);
  float glint = pow(max(dot(ng, Hh), 0.0), 1500.0) * 1.4 * env + env * 0.12 + pow(max(dot(n, Hh), 0.0), 30.0) * 0.03;
  col += u_lightCol * glint * (0.3 + 0.7 * calm);
  // shoreline foam
  float foam = (1.0 - smoothstep(0.0, 0.12, depth)) * smoothstep(0.45, 0.7, vn3(vec3(p * 6.0, u_time * 0.6)) + sin(depth * 60.0 - u_time * 2.0) * 0.15);
  col = mix(col, vec3(0.85, 0.88, 0.85), foam * 0.6);
  float alpha = mix(0.35, 0.92, smoothstep(0.0, 0.5, depth)) + fres * 0.2;
  if (u_useMap == 1) col *= 1.0 - texture(u_fow, v_wpos.xz / u_mapSize).a * 0.96;
  float fogF = smoothstep(u_fogNear, u_fogFar, wd);
  if (u_hdr == 1) col = mix(col, u_fogCol, fogF); else col = mix(aces(col), u_fogCol, fogF);
  o = vec4(col, clamp(alpha, 0.0, 1.0));
}`;

const SPRITE_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=4) in vec4 i_p;
layout(location=5) in vec4 i_c;
uniform mat4 u_vp; uniform vec3 u_right, u_up;
out vec2 v_q; out vec4 v_c;
void main() {
  vec3 w = i_p.xyz + (u_right * a_pos.x + u_up * a_pos.y) * i_p.w;
  v_q = a_pos.xy; v_c = i_c;
  gl_Position = u_vp * vec4(w, 1.0);
}`;
const SPRITE_FS = `#version 300 es
precision mediump float;
in vec2 v_q; in vec4 v_c;
out vec4 o;
void main() { float r = dot(v_q, v_q); if (r > 1.0) discard; float a = (1.0 - r); o = vec4(v_c.rgb, v_c.a * a * a); }`;

// ---- full-screen passes ----
const FS_VS = `#version 300 es
out vec2 v_uv;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); v_uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const SKY_VS = `#version 300 es
out vec2 v_uv;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); v_uv = p; gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0); }`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform mat4 u_invVP; uniform vec3 u_camPos, u_sunDir, u_top, u_hor, u_sunCol; uniform float u_time; uniform int u_hdr;
${GLSL_NOISE}
void main() {
  vec4 w = u_invVP * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w - u_camPos);
  float t = clamp(d.y, -1.0, 1.0);
  vec3 col = mix(u_hor, u_top, pow(max(t, 0.0), 0.45));
  col = mix(col, u_hor * 0.75, smoothstep(0.0, -0.25, t));
  float sd = max(dot(d, u_sunDir), 0.0);
  col += u_sunCol * (pow(sd, 900.0) * 12.0 + pow(sd, 12.0) * 0.35 + pow(sd, 3.0) * 0.08);
  if (t > 0.0) {
    vec2 uv = d.xz / (t + 0.12) * 0.55 + vec2(u_time * 0.006, u_time * 0.002);
    float c = smoothstep(0.48, 0.78, fbm3(vec3(uv * 2.2, u_time * 0.01)));
    vec3 cc = mix(vec3(1.0), u_hor, 0.25) * (0.8 + 0.4 * sd);
    col = mix(col, cc, c * 0.75 * smoothstep(0.0, 0.25, t));
  }
  o = vec4(u_hdr == 1 ? col : clamp(col, 0.0, 1.0), 1.0);
}`;

const SSAO_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_depth; uniform mat4 u_proj; uniform vec2 u_texel;
uniform float u_near, u_far, u_tanY, u_aspect, u_radius;
float linZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near)); }
vec3 vpos(vec2 uv) { float z = linZ(texture(u_depth, uv).r); return vec3((uv * 2.0 - 1.0) * vec2(u_tanY * u_aspect, u_tanY) * z, -z); }
float hh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float d = texture(u_depth, v_uv).r;
  if (d >= 0.99999) { o = vec4(1.0); return; }
  vec3 P = vpos(v_uv);
  vec3 px1 = vpos(v_uv + vec2(u_texel.x, 0.0)) - P, px2 = P - vpos(v_uv - vec2(u_texel.x, 0.0));
  vec3 py1 = vpos(v_uv + vec2(0.0, u_texel.y)) - P, py2 = P - vpos(v_uv - vec2(0.0, u_texel.y));
  vec3 dx = abs(px1.z) < abs(px2.z) ? px1 : px2, dy = abs(py1.z) < abs(py2.z) ? py1 : py2;
  vec3 N = normalize(cross(dx, dy));
  if (N.z < 0.0) N = -N;
  float rad = u_radius * (0.6 + 0.02 * -P.z);
  float occ = 0.0;
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    vec3 r = vec3(hh(gl_FragCoord.xy + fi * 7.13), hh(gl_FragCoord.yx + fi * 3.71), hh(gl_FragCoord.xy * 0.37 + fi * 1.93)) * 2.0 - 1.0;
    r = normalize(r + 1e-4);
    if (dot(r, N) < 0.0) r = -r;
    float sc = (fi + 1.0) / 14.0; sc = mix(0.12, 1.0, sc * sc);
    vec3 S = P + (r * 0.85 + N * 0.15) * rad * sc;
    vec4 c = u_proj * vec4(S, 1.0);
    vec2 suv = c.xy / c.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
    float sz = vpos(suv).z;
    float range = smoothstep(0.0, 1.0, rad / max(abs(P.z - sz), 1e-4));
    occ += (sz >= S.z + 0.01 * rad ? 1.0 : 0.0) * range;
  }
  o = vec4(vec3(clamp(1.0 - occ / 14.0, 0.0, 1.0)), 1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_src; uniform vec2 u_dir;
void main() {
  vec4 c = texture(u_src, v_uv) * 0.2270;
  c += (texture(u_src, v_uv + u_dir * 1.3846) + texture(u_src, v_uv - u_dir * 1.3846)) * 0.3162;
  c += (texture(u_src, v_uv + u_dir * 3.2308) + texture(u_src, v_uv - u_dir * 3.2308)) * 0.0703;
  o = c;
}`;

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_src; uniform vec2 u_texel; uniform float u_thresh;
void main() {
  vec3 c = (texture(u_src, v_uv + u_texel * vec2(-0.5, -0.5)).rgb + texture(u_src, v_uv + u_texel * vec2(0.5, -0.5)).rgb +
            texture(u_src, v_uv + u_texel * vec2(-0.5, 0.5)).rgb + texture(u_src, v_uv + u_texel * vec2(0.5, 0.5)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(u_thresh, u_thresh + 0.6, l), 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_color, u_depth, u_ao, u_bloomA, u_bloomB;
uniform vec2 u_texel;
uniform float u_near, u_far, u_focus, u_focusRange, u_dofMax, u_aoAmt, u_bloomAmt, u_exposure, u_vig, u_grain, u_time, u_sat, u_contrast;
uniform vec3 u_grade, u_lift;
uniform int u_dofTaps, u_useAO;
float linZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near)); }
float cocAt(float z) { float c = clamp(abs(z - u_focus) / max(u_focus * u_focusRange, 1e-3), 0.0, 1.0); return c * c * u_dofMax; }
vec3 aces(vec3 c) { return clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0); }
float hh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float z = linZ(texture(u_depth, v_uv).r);
  vec3 c = texture(u_color, v_uv).rgb;
  if (u_dofTaps > 0) {
    float coc = cocAt(z);
    if (coc > 0.6) {
      vec3 acc = c; float ws = 1.0;
      float rot = hh(gl_FragCoord.xy) * 6.2832;
      for (int i = 0; i < 40; i++) {
        if (i >= u_dofTaps) break;
        float fi = float(i);
        float r = sqrt((fi + 0.5) / float(u_dofTaps)) * coc;
        float a = fi * 2.39996 + rot;
        vec2 uv = v_uv + vec2(cos(a), sin(a)) * r * u_texel;
        float sz = linZ(texture(u_depth, uv).r);
        float sc = cocAt(sz);
        // a sharp object in front must not bleed into the blurred background
        float w = sz < z ? smoothstep(r - 1.0, r + 1.0, sc) : 1.0;
        acc += texture(u_color, uv).rgb * w; ws += w;
      }
      c = acc / ws;
    }
  }
  if (u_useAO == 1) { float ao = texture(u_ao, v_uv).r; c *= mix(1.0, ao, u_aoAmt); }
  c += (texture(u_bloomA, v_uv).rgb * 0.6 + texture(u_bloomB, v_uv).rgb * 0.8) * u_bloomAmt;
  c = aces(c * u_exposure);
  c = c * u_grade + u_lift;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, u_sat);
  c = mix(c, c * c * (3.0 - 2.0 * c), u_contrast);
  float d = length((v_uv - 0.5) * vec2(1.25, 1.0));
  c *= 1.0 - u_vig * smoothstep(0.35, 0.95, d);
  c += (hh(v_uv * 913.7 + u_time) - 0.5) * u_grain;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// Quality presets: 0 Low, 1 Medium, 2 High, 3 Ultra
const QUALITY = [
  { name: 'Low',    bump: false, post: false, ssao: false, bloom: false, dof: 0,  shadow: 1024, pcf: 4,  msaa: 0, particles: 0.0, grain: 0 },
  { name: 'Medium', post: true,  ssao: false, bloom: true,  dof: 12, shadow: 2048, pcf: 8,  msaa: 4, particles: 0.5, grain: 0.012 },
  { name: 'High',   post: true,  ssao: true,  bloom: true,  dof: 24, shadow: 2048, pcf: 16, msaa: 4, particles: 1.0, grain: 0.015 },
  { name: 'Ultra',  post: true,  ssao: true,  bloom: true,  dof: 36, shadow: 4096, pcf: 16, msaa: 4, particles: 1.4, grain: 0.015, aoFull: true },
];

const GL3D = {
  ok: false, canvas: null, gl: null, used: false, time: 0,
  settings: { mode3d: true, shadows: true, grass: 1, quality: null, dof: true },

  init() {
    try { const s = JSON.parse(localStorage.getItem('eots_gfx') || 'null'); if (s) Object.assign(this.settings, s); } catch (e) { }
    this.tablet = typeof App !== 'undefined' && !!App.touch;
    if (this.settings.quality === null || this.settings.quality === undefined) this.settings.quality = this.tablet ? 1 : 2;
    const c = document.createElement('canvas');
    c.id = 'gl3d';
    c.style.cssText = 'position:fixed;left:0;top:0;display:none;';
    document.body.insertBefore(c, document.body.firstChild);
    let gl = null;
    try { gl = c.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }); } catch (e) { }
    if (!gl) { this.ok = false; return; }
    this.canvas = c; this.gl = gl; this.ok = true;
    this.lit = this.program(LIT_VS, LIT_FS);
    this.depth = this.program(LIT_VS, DEPTH_FS);
    this.water = this.program(LIT_VS, WATER_FS);
    this.sprite = this.program(SPRITE_VS, SPRITE_FS);
    this.instBuf = gl.createBuffer();
    this.instCap = 0;
    this.quad = this.mesh(MeshB.quad());
    this.white = this.texture(null);
    this.blankMap = this.texture(null);
    this.blackTex = (() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0])); return t; })();
    this.emptyVao = gl.createVertexArray();
    // post-processing support
    try {
      this.sky = this.program(SKY_VS, SKY_FS);
      this.hdrExt = !!gl.getExtension('EXT_color_buffer_float');
      gl.getExtension('OES_texture_float_linear');
      this.ssao = this.program(FS_VS, SSAO_FS);
      this.blur = this.program(FS_VS, BLUR_FS);
      this.bright = this.program(FS_VS, BRIGHT_FS);
      this.composite = this.program(FS_VS, COMPOSITE_FS);
      this.maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;
      this.postOK = true;
    } catch (e) { console.warn('Post-processing unavailable', e); this.postOK = false; }
    this.targets = new Map();
    this.applyQuality();
    c.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
  },
  get Q() { return QUALITY[clamp(this.settings.quality | 0, 0, 3)]; },
  applyQuality() {
    const size = this.tablet ? Math.min(this.Q.shadow, 2048) : this.Q.shadow;
    if (size !== this.shadowSize) {
      if (this.shadowTex) { this.gl.deleteTexture(this.shadowTex); this.gl.deleteFramebuffer(this.shadowFbo); }
      this.initShadow(size);
    }
    for (const t of this.targets.values()) this.freeTarget(t);
    this.targets.clear();
  },
  saveSettings() { try { localStorage.setItem('eots_gfx', JSON.stringify(this.settings)); } catch (e) { } },
  get active() { return this.ok && this.settings.mode3d && !this.lost; },
  get postActive() { return this.postOK && this.Q.post; },

  program(vs, fs) {
    const gl = this.gl;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  },
  initShadow(size) {
    const gl = this.gl;
    this.shadowSize = size;
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  },

  // -------- offscreen targets for post-processing --------
  makeTex(w, h, fmt, filter) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (fmt === 'depth') gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, w, h);
    else gl.texStorage2D(gl.TEXTURE_2D, 1, fmt === 'hdr' ? gl.RGBA16F : gl.RGBA8, w, h);
    const f = filter || (fmt === 'depth' ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  },
  fboFor(color, depth) {
    const gl = this.gl, f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    if (color) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    if (depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return ok ? f : null;
  },
  target(w, h) {
    const key = w + 'x' + h;
    let T = this.targets.get(key);
    if (T) { T.used = performance.now(); return T; }
    if (this.targets.size >= 3) {   // drop the least recently used size
      let old = null; for (const t of this.targets.values()) if (!old || t.used < old.used) old = t;
      this.freeTarget(old); this.targets.delete(old.key);
    }
    const gl = this.gl, Q = this.Q;
    T = { key, w, h, used: performance.now(), texs: [], fbos: [], rbs: [] };
    let fmt = this.hdrExt ? 'hdr' : 'ldr';
    T.color = this.makeTex(w, h, fmt); T.depth = this.makeTex(w, h, 'depth');
    T.resolve = this.fboFor(T.color, T.depth);
    if (!T.resolve && fmt === 'hdr') { gl.deleteTexture(T.color); fmt = 'ldr'; T.color = this.makeTex(w, h, fmt); T.resolve = this.fboFor(T.color, T.depth); }
    T.fmt = fmt;
    T.texs.push(T.color, T.depth); T.fbos.push(T.resolve);
    // multisampled scene buffer
    const samples = Math.min(Q.msaa, this.maxSamples);
    if (samples > 1) {
      const crb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, crb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt === 'hdr' ? gl.RGBA16F : gl.RGBA8, w, h);
      const drb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, drb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, crb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, drb);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) { T.msaa = f; T.rbs.push(crb, drb); T.fbos.push(f); }
      else { gl.deleteFramebuffer(f); gl.deleteRenderbuffer(crb); gl.deleteRenderbuffer(drb); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1), qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    const aw = Q.aoFull ? w : hw, ah = Q.aoFull ? h : hh;
    const mk = (ww, hh2, f) => { const t = this.makeTex(ww, hh2, f); const fb = this.fboFor(t, null); T.texs.push(t); T.fbos.push(fb); return { t, fb, w: ww, h: hh2 }; };
    T.ao = mk(aw, ah, 'ldr'); T.ao2 = mk(aw, ah, 'ldr');
    T.bA = mk(hw, hh, fmt); T.bA2 = mk(hw, hh, fmt); T.bB = mk(qw, qh, fmt); T.bB2 = mk(qw, qh, fmt);
    this.targets.set(key, T);
    return T;
  },
  freeTarget(T) {
    const gl = this.gl;
    for (const t of T.texs) gl.deleteTexture(t);
    for (const f of T.fbos) if (f) gl.deleteFramebuffer(f);
    for (const r of T.rbs) gl.deleteRenderbuffer(r);
  },

  // -------- resources --------
  mesh(d) {
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bufs = [];
    const buf = (loc, data, size) => {
      const b = gl.createBuffer(); bufs.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); return b;
    };
    const n = d.pos.length / 3;
    buf(0, d.pos, 3);
    buf(1, d.nrm || new Float32Array(n * 3).fill(0).map((v, i) => i % 3 === 1 ? 1 : 0), 3);
    buf(2, d.col || new Float32Array(n * 3).fill(1), 3);
    buf(3, d.uv || new Float32Array(n * 2), 2);
    const ib = gl.createBuffer(); bufs.push(ib); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, bufs, count: d.idx.length, bounds: d.bounds };
  },
  texture(src, o = {}) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    this.texParams(t, src, o);
    return t;
  },
  texParams(t, src, o) {
    const gl = this.gl;
    const wrap = o.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    if (o.nearest) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); }
    else if (src && o.mips !== false) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const ext = gl.getExtension('EXT_texture_filter_anisotropic');
      if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    } else { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); }
  },
  updateTexture(t, src, o = {}) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    this.texParams(t, src, o);
  },
  free(m) {   // release a mesh, texture or instance buffer
    if (!m || !this.ok) return;
    const gl = this.gl;
    if (m instanceof WebGLTexture) { gl.deleteTexture(m); return; }
    if (m.vao) { gl.deleteVertexArray(m.vao); for (const b of m.bufs || []) gl.deleteBuffer(b); m.vao = null; }
    if (m.buf) { gl.deleteBuffer(m.buf); m.buf = null; }
  },
  staticInst(data) {   // a persistent instance buffer (e.g. grass)
    const gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buf: b, count: data.length / 20 };
  },

  // -------- frame --------
  beginFrame() { this.used = false; this.cleared = false; },
  endFrame() {
    if (!this.ok) return;
    const show = this.used ? 'block' : 'none';
    if (this.canvas.style.display !== show) this.canvas.style.display = show;
  },
  resize(ww, wh, dpr) {
    if (!this.ok) return;
    // tablets: render 3D at a slightly lower resolution to keep it smooth and cool
    if (App.touch) dpr = Math.min(dpr, 1.5);
    else dpr = Math.min(dpr, 2);
    this.pr = dpr;
    this.canvas.width = Math.round(ww * dpr); this.canvas.height = Math.round(wh * dpr);
    this.canvas.style.width = ww + 'px'; this.canvas.style.height = wh + 'px';
  },
  vpRect(r) {
    const pr = this.pr || App.dpr;
    const s = App.scale * pr, ox = App.ox * pr, oy = App.oy * pr;
    const x = Math.round(ox + r.x * s), w = Math.round(r.w * s), h = Math.round(r.h * s);
    const y = Math.round(this.canvas.height - (oy + (r.y + r.h) * s));
    return [x, y, w, h];
  },

  // Render a view: {rect, cam, env, items, sprites, shadow:{c, r}, sky, focus, focusRange, post}
  render(v) {
    const gl = this.gl;
    if (!this.ok) return;
    this.used = true;
    const env = v.env, Q = this.Q;
    // ---- shadow pass ----
    let lightVP = M4.ident(), useShadow = 0;
    if (v.shadow && this.settings.shadows) {
      const L = env.lightDir, c = v.shadow.c, r = v.shadow.r;
      const texel = 2 * r / this.shadowSize;
      const eye = [c[0] + L[0] * 60, c[1] + L[1] * 60, c[2] + L[2] * 60];
      const lv = M4.lookAt(eye, c, [0, 1, 0]);
      const cc = M4.xform(lv, c[0], c[1], c[2]);
      const sx = Math.round(cc[0] / texel) * texel - cc[0], sy = Math.round(cc[1] / texel) * texel - cc[1];
      lightVP = M4.mul(M4.ortho(-r + sx, r + sx, -r + sy, r + sy, 1, 140), lv);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.disable(gl.SCISSOR_TEST);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.colorMask(false, false, false, false);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.2, 2.0);
      gl.useProgram(this.depth.p);
      gl.uniformMatrix4fv(this.depth.u.u_vp, false, lightVP);
      gl.uniform1f(this.depth.u.u_time, this.time);
      for (const it of v.items) if (it.shadow !== false && !it.water && !it.alpha) this.drawItem(this.depth, it, true);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.colorMask(true, true, true, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      useShadow = 1;
    }
    // ---- scene pass ----
    const [x, y, w, h] = this.vpRect(v.rect);
    if (w < 2 || h < 2) return;
    const post = this.postActive && v.post !== false;
    let T = null;
    if (post) {
      T = this.target(w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.msaa || T.resolve);
      gl.viewport(0, 0, w, h); gl.disable(gl.SCISSOR_TEST);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(x, y, w, h); gl.enable(gl.SCISSOR_TEST); gl.scissor(x, y, w, h);
    }
    const hdr = post && T.fmt === 'hdr' ? 1 : 0;
    const cl = env.clear || [0, 0, 0];
    gl.clearColor(cl[0], cl[1], cl[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const cam = v.cam;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    const setCommon = P => {
      gl.useProgram(P.p);
      const u = P.u;
      gl.uniformMatrix4fv(u.u_vp, false, cam.vp);
      if (u.u_lightVP) gl.uniformMatrix4fv(u.u_lightVP, false, lightVP);
      gl.uniform1f(u.u_time, this.time);
      if (u.u_hdr) gl.uniform1i(u.u_hdr, hdr);
      if (u.u_lightDir) gl.uniform3fv(u.u_lightDir, env.lightDir);
      if (u.u_lightCol) gl.uniform3fv(u.u_lightCol, env.lightCol);
      if (u.u_sky) gl.uniform3fv(u.u_sky, env.sky);
      if (u.u_ground) gl.uniform3fv(u.u_ground, env.ground);
      if (u.u_fogCol) gl.uniform3fv(u.u_fogCol, env.fogCol);
      if (u.u_camPos) gl.uniform3fv(u.u_camPos, cam.pos);
      if (u.u_fogNear) { gl.uniform1f(u.u_fogNear, env.fogNear); gl.uniform1f(u.u_fogFar, env.fogFar); }
      if (u.u_snow) gl.uniform1f(u.u_snow, 0);
      if (u.u_pcf) gl.uniform1i(u.u_pcf, this.tablet ? Math.min(8, Q.pcf) : Q.pcf);
      if (u.u_shadow) {
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.uniform1i(u.u_shadow, 1); gl.uniform1i(u.u_useShadow, useShadow); gl.uniform1f(u.u_shadowTexel, 1 / this.shadowSize);
      }
      if (u.u_fow) {
        const m = env.map;
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, m ? m.fow : this.blankMap); gl.uniform1i(u.u_fow, 2);
        if (u.u_terr) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, m ? m.terr : this.blankMap); gl.uniform1i(u.u_terr, 3); }
        if (u.u_canopy) { gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, m && m.canopy && Q.bump !== false ? m.canopy : this.blackTex); gl.uniform1i(u.u_canopy, 4); }
        gl.uniform2f(u.u_mapSize, m ? m.w : 1, m ? m.h : 1);
      }
    };
    setCommon(this.lit);
    const opaque = v.items.filter(i => !i.alpha && !i.water), trans = v.items.filter(i => i.alpha && !i.water), water = v.items.filter(i => i.water);
    for (const it of opaque) this.drawItem(this.lit, it, false, env);
    if (v.sky) { this.drawSky(v, hdr); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); }
    if (water.length) {
      setCommon(this.water);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const it of water) { gl.uniform1i(this.water.u.u_useMap, it.map && env.map ? 1 : 0); this.drawItem(this.water, it, true); }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    if (trans.length) {
      setCommon(this.lit);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const it of trans) this.drawItem(this.lit, it, false, env);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    if (v.sprites && v.sprites.length) this.drawSprites(v.sprites, cam);
    gl.bindVertexArray(null);
    if (post) this.postProcess(T, v, x, y, w, h);
    gl.disable(gl.SCISSOR_TEST);
  },

  drawSky(v, hdr) {
    const gl = this.gl, P = this.sky, s = v.sky, cam = v.cam;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.u_invVP, false, cam.inv);
    gl.uniform3fv(P.u.u_camPos, cam.pos);
    gl.uniform3fv(P.u.u_sunDir, s.sunDir); gl.uniform3fv(P.u.u_top, s.top); gl.uniform3fv(P.u.u_hor, s.hor); gl.uniform3fv(P.u.u_sunCol, s.sunCol);
    gl.uniform1f(P.u.u_time, this.time); gl.uniform1i(P.u.u_hdr, hdr);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
  },

  fsPass(P, fbo, w, h, setup) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(P.p);
    let unit = 5;
    const tex = (name, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(P.u[name], unit); unit++; };
    setup(P.u, tex);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  postProcess(T, v, x, y, w, h) {
    const gl = this.gl, Q = this.Q, cam = v.cam;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    if (T.msaa) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.msaa);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.resolve);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }
    const tanY = Math.tan(cam.fov / 2), aspect = w / h;
    const useAO = Q.ssao && v.ao !== false;
    if (useAO) {
      const A = T.ao;
      this.fsPass(this.ssao, A.fb, A.w, A.h, (u, tex) => {
        tex('u_depth', T.depth);
        gl.uniformMatrix4fv(u.u_proj, false, cam.proj);
        gl.uniform2f(u.u_texel, 1 / w, 1 / h);
        gl.uniform1f(u.u_near, cam.near); gl.uniform1f(u.u_far, cam.far); gl.uniform1f(u.u_tanY, tanY); gl.uniform1f(u.u_aspect, aspect);
        gl.uniform1f(u.u_radius, v.aoRadius || 0.3);
      });
      this.fsPass(this.blur, T.ao2.fb, A.w, A.h, (u, tex) => { tex('u_src', T.ao.t); gl.uniform2f(u.u_dir, 1 / A.w, 0); });
      this.fsPass(this.blur, T.ao.fb, A.w, A.h, (u, tex) => { tex('u_src', T.ao2.t); gl.uniform2f(u.u_dir, 0, 1 / A.h); });
    }
    if (Q.bloom) {
      const B = T.bA, C = T.bB;
      this.fsPass(this.bright, B.fb, B.w, B.h, (u, tex) => { tex('u_src', T.color); gl.uniform2f(u.u_texel, 1 / w, 1 / h); gl.uniform1f(u.u_thresh, v.bloomThresh ?? 0.85); });
      this.fsPass(this.blur, T.bA2.fb, B.w, B.h, (u, tex) => { tex('u_src', B.t); gl.uniform2f(u.u_dir, 1 / B.w, 0); });
      this.fsPass(this.blur, B.fb, B.w, B.h, (u, tex) => { tex('u_src', T.bA2.t); gl.uniform2f(u.u_dir, 0, 1 / B.h); });
      this.fsPass(this.blur, C.fb, C.w, C.h, (u, tex) => { tex('u_src', B.t); gl.uniform2f(u.u_dir, 1.5 / B.w, 0); });
      this.fsPass(this.blur, T.bB2.fb, C.w, C.h, (u, tex) => { tex('u_src', C.t); gl.uniform2f(u.u_dir, 1 / C.w, 0); });
      this.fsPass(this.blur, C.fb, C.w, C.h, (u, tex) => { tex('u_src', T.bB2.t); gl.uniform2f(u.u_dir, 0, 1 / C.h); });
    }
    // composite to the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(x, y, w, h);
    const P = this.composite, g = v.grade || {};
    gl.viewport(x, y, w, h);
    gl.useProgram(P.p);
    let unit = 5;
    const tex = (name, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(P.u[name], unit); unit++; };
    tex('u_color', T.color); tex('u_depth', T.depth); tex('u_ao', useAO ? T.ao.t : this.white);
    tex('u_bloomA', Q.bloom ? T.bA.t : this.blackTex); tex('u_bloomB', Q.bloom ? T.bB.t : this.blackTex);
    const u = P.u;
    gl.uniform2f(u.u_texel, 1 / w, 1 / h);
    gl.uniform1f(u.u_near, cam.near); gl.uniform1f(u.u_far, cam.far);
    const focus = v.focus ?? cam.dist ?? 10;
    gl.uniform1f(u.u_focus, focus); gl.uniform1f(u.u_focusRange, v.focusRange ?? 0.5);
    const dofOn = this.settings.dof && Q.dof > 0 && v.dof !== false;
    gl.uniform1f(u.u_dofMax, (v.dofMax ?? 9) * h / 720);
    gl.uniform1i(u.u_dofTaps, dofOn ? (this.tablet ? Math.min(10, Q.dof) : Q.dof) : 0);
    gl.uniform1i(u.u_useAO, useAO ? 1 : 0); gl.uniform1f(u.u_aoAmt, v.aoAmt ?? 0.85);
    gl.uniform1f(u.u_bloomAmt, Q.bloom ? (v.bloomAmt ?? 0.5) : 0);
    gl.uniform1f(u.u_exposure, g.exposure ?? 1.08);
    gl.uniform3fv(u.u_grade, g.gain || [1.02, 1.0, 0.96]); gl.uniform3fv(u.u_lift, g.lift || [0.01, 0.005, 0.0]);
    gl.uniform1f(u.u_sat, g.sat ?? 1.08); gl.uniform1f(u.u_contrast, g.contrast ?? 0.18);
    gl.uniform1f(u.u_vig, v.vignette ?? 0.32); gl.uniform1f(u.u_grain, Q.grain); gl.uniform1f(u.u_time, this.time % 100);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
  },

  drawItem(P, it, depthOnly, env) {
    const gl = this.gl, u = P.u, m = it.mesh;
    if (!m) return;
    if (it.cull === false || it.twoSided) gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); }
    if (u.u_wind) gl.uniform1f(u.u_wind, it.wind || 0);
    if (u.u_useTex) {
      if (it.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, it.tex); gl.uniform1i(u.u_tex, 0); gl.uniform1i(u.u_useTex, 1); }
      else gl.uniform1i(u.u_useTex, 0);
      gl.uniform1f(u.u_cut, it.cut || 0);
    }
    if (!depthOnly) {
      gl.uniform1f(u.u_spec, it.spec ?? 0.1); gl.uniform1f(u.u_shin, it.shin ?? 16);
      gl.uniform1f(u.u_emis, it.emis || 0); gl.uniform1f(u.u_alpha, it.alpha || 1);
      gl.uniform1f(u.u_rim, it.rim || 0);
      gl.uniform1f(u.u_coat, it.coat || 0); gl.uniform1f(u.u_trans, it.trans || 0);
      gl.uniform1f(u.u_bump, this.Q.bump === false ? 0 : (it.bump || 0));
      const bs = it.bumpScale ?? 6; if (typeof bs === 'number') gl.uniform3f(u.u_bumpScale, bs, bs, bs); else gl.uniform3fv(u.u_bumpScale, bs);
      gl.uniform3fv(u.u_tintMul, it.tintMul || ONE3);
      gl.uniform1f(u.u_snow, it.snow === false || !env ? 0 : (env.snow || 0));
      gl.uniform1i(u.u_useMap, it.map && env && env.map ? 1 : 0);
    }
    gl.bindVertexArray(m.vao);
    let count = 1;
    if (it.inst) {
      if (it.inst.buf) { gl.bindBuffer(gl.ARRAY_BUFFER, it.inst.buf); count = it.inst.count; }
      else {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
        const data = it.inst.data; count = it.inst.count;
        if (!count) return;
        const bytes = count * 80;
        if (bytes > this.instCap) { this.instCap = Math.max(bytes, this.instCap * 2); gl.bufferData(gl.ARRAY_BUFFER, this.instCap, gl.DYNAMIC_DRAW); }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * 20);
      }
      for (let i = 0; i < 5; i++) {
        gl.enableVertexAttribArray(4 + i);
        gl.vertexAttribPointer(4 + i, 4, gl.FLOAT, false, 80, i * 16);
        gl.vertexAttribDivisor(4 + i, 1);
      }
      gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0, count);
    } else {
      for (let i = 0; i < 5; i++) gl.disableVertexAttribArray(4 + i);
      const M = it.model || IDENT;
      gl.vertexAttrib4f(4, M[0], M[1], M[2], M[3]); gl.vertexAttrib4f(5, M[4], M[5], M[6], M[7]);
      gl.vertexAttrib4f(6, M[8], M[9], M[10], M[11]); gl.vertexAttrib4f(7, M[12], M[13], M[14], M[15]);
      const t = it.tint || [1, 1, 1];
      gl.vertexAttrib4f(8, t[0], t[1], t[2], 1);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
    }
  },

  // sprites: {v:[x,y,z,size, r,g,b,a], add}
  drawSprites(list, cam) {
    const gl = this.gl, P = this.sprite;
    gl.enable(gl.DEPTH_TEST);
    for (const group of [list.filter(s => !s.add), list.filter(s => s.add)]) {
      if (!group.length) continue;
      const data = new Float32Array(group.length * 8);
      group.forEach((s, i) => data.set(s.v, i * 8));
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.u_vp, false, cam.vp);
      const V = cam.view;
      gl.uniform3f(P.u.u_right, V[0], V[4], V[8]); gl.uniform3f(P.u.u_up, V[1], V[5], V[9]);
      gl.enable(gl.BLEND);
      if (group[0].add) gl.blendFunc(gl.SRC_ALPHA, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false); gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.quad.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      const bytes = data.byteLength;
      if (bytes > this.instCap) { this.instCap = Math.max(bytes, this.instCap * 2); gl.bufferData(gl.ARRAY_BUFFER, this.instCap, gl.DYNAMIC_DRAW); }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      for (let i = 0; i < 5; i++) gl.disableVertexAttribArray(4 + i);
      for (let i = 0; i < 2; i++) { gl.enableVertexAttribArray(4 + i); gl.vertexAttribPointer(4 + i, 4, gl.FLOAT, false, 32, i * 16); gl.vertexAttribDivisor(4 + i, 1); }
      gl.drawElementsInstanced(gl.TRIANGLES, this.quad.count, gl.UNSIGNED_INT, 0, group.length);
      gl.depthMask(true); gl.disable(gl.BLEND);
      for (let i = 0; i < 2; i++) gl.vertexAttribDivisor(4 + i, 0);
    }
  },
};
const IDENT = M4.ident();
const ONE3 = [1, 1, 1];

// Ambient particles: pollen, dust motes, falling leaves, snow (stateless, from time)
function ambientParticles(out, cx, cy, cz, radius, season, t, density) {
  const n = Math.round(90 * density);
  for (let i = 0; i < n; i++) {
    const a = hash2(i, 1, 77), b = hash2(i, 2, 77), c = hash2(i, 3, 77), d = hash2(i, 4, 77);
    let x, y, z, size, col, add = true;
    if (season === 3) {           // snow
      const fall = 0.35 + d * 0.3;
      y = cy + 6 - ((t * fall + c * 8) % 8);
      x = cx + (a - 0.5) * radius * 2 + Math.sin(t * 0.7 + i) * 0.3; z = cz + (b - 0.5) * radius * 2;
      size = 0.035 + d * 0.03; col = [1, 1, 1, 0.85]; add = false;
    } else if (season === 2 && i % 3 === 0) {   // drifting autumn leaf flecks
      y = cy + 4 - ((t * 0.25 + c * 5) % 5);
      x = cx + (a - 0.5) * radius * 2 + Math.sin(t * 0.9 + i) * 0.6; z = cz + (b - 0.5) * radius * 2 + Math.cos(t * 0.6 + i) * 0.4;
      size = 0.05; col = [0.9, 0.5, 0.15, 0.9]; add = false;
    } else {                      // glowing pollen / dust in the sunlight
      x = cx + (a - 0.5) * radius * 2 + Math.sin(t * 0.21 + i * 1.7) * 0.5;
      z = cz + (b - 0.5) * radius * 2 + Math.cos(t * 0.17 + i * 2.3) * 0.5;
      y = cy + 0.2 + c * 2.6 + Math.sin(t * 0.5 + i) * 0.15;
      size = 0.018 + d * 0.022;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + i * 3.1);
      col = season === 0 ? [1.6, 1.5, 0.8, 0.5 * tw] : [1.5, 1.3, 0.9, 0.42 * tw];
    }
    out.push({ v: [x, y, z, size, col[0], col[1], col[2], col[3]], add });
  }
}

// Instance list helper: collects matrices + tints for one mesh
class InstList {
  constructor(cap = 64) { this.data = new Float32Array(cap * 20); this.count = 0; }
  reset() { this.count = 0; }
  grow() { const n = new Float32Array(this.data.length * 2); n.set(this.data); this.data = n; }
  push(px, py, pz, fx, fy, fz, ux, uy, uz, s, r = 1, g = 1, b = 1) {
    if ((this.count + 1) * 20 > this.data.length) this.grow();
    const o = this.count * 20;
    M4.basis(this.data, o, px, py, pz, fx, fy, fz, ux, uy, uz, s);
    this.data[o + 16] = r; this.data[o + 17] = g; this.data[o + 18] = b; this.data[o + 19] = 1;
    this.count++;
  }
  pushYaw(px, py, pz, yaw, s, r = 1, g = 1, b = 1, sy) {
    if ((this.count + 1) * 20 > this.data.length) this.grow();
    const o = this.count * 20;
    M4.yaw(this.data, o, px, py, pz, yaw, s, sy ?? s);
    this.data[o + 16] = r; this.data[o + 17] = g; this.data[o + 18] = b; this.data[o + 19] = 1;
    this.count++;
  }
  item(mesh, extra) { return Object.assign({ mesh, inst: { data: this.data, count: this.count } }, extra); }
}
