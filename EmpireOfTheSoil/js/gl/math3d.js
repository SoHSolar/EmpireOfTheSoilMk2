// =====================================================================
//  Minimal 3D math (column-major 4x4 matrices, like WebGL expects)
// =====================================================================
'use strict';

const M4 = {
  ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b, out = new Float32Array(16)) {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return out;
  },
  persp(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far);
    return m;
  },
  ortho(l, r, b, t, n, f) {
    const m = new Float32Array(16);
    m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
    m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1;
    return m;
  },
  lookAt(eye, at, up) {
    let zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    const m = new Float32Array(16);
    m[0] = xx; m[1] = yx; m[2] = zx; m[4] = xy; m[5] = yy; m[6] = zy; m[8] = xz; m[9] = yz; m[10] = zz;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    m[15] = 1;
    return m;
  },
  invert(a) {
    const m = new Float32Array(16);
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return M4.ident();
    det = 1 / det;
    m[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; m[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    m[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; m[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    m[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; m[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    m[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; m[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    m[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; m[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    m[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; m[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    m[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; m[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    m[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; m[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return m;
  },
  // Build a transform from a forward direction, an up direction, uniform scale and position.
  // Model space: +x forward, +y up, +z right.
  basis(out, o, px, py, pz, fx, fy, fz, ux, uy, uz, s) {
    let l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
    // make up orthogonal to forward
    const d = ux * fx + uy * fy + uz * fz; ux -= fx * d; uy -= fy * d; uz -= fz * d;
    l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    const rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;
    out[o] = fx * s; out[o + 1] = fy * s; out[o + 2] = fz * s; out[o + 3] = 0;
    out[o + 4] = ux * s; out[o + 5] = uy * s; out[o + 6] = uz * s; out[o + 7] = 0;
    out[o + 8] = rx * s; out[o + 9] = ry * s; out[o + 10] = rz * s; out[o + 11] = 0;
    out[o + 12] = px; out[o + 13] = py; out[o + 14] = pz; out[o + 15] = 1;
  },
  // yaw around Y, uniform scale (fast path)
  yaw(out, o, px, py, pz, yaw, s, sy = s) {
    const c = Math.cos(yaw) * s, n = Math.sin(yaw) * s;
    out[o] = c; out[o + 1] = 0; out[o + 2] = -n; out[o + 3] = 0;
    out[o + 4] = 0; out[o + 5] = sy; out[o + 6] = 0; out[o + 7] = 0;
    out[o + 8] = n; out[o + 9] = 0; out[o + 10] = c; out[o + 11] = 0;
    out[o + 12] = px; out[o + 13] = py; out[o + 14] = pz; out[o + 15] = 1;
  },
  xform(m, x, y, z, w = 1) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w,
      m[2] * x + m[6] * y + m[10] * z + m[14] * w, m[3] * x + m[7] * y + m[11] * z + m[15] * w];
  },
};
const V3 = {
  norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; },
  cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
  sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
  add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
  scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; },
  dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
};

// Orbit camera shared by the 3D views
class OrbitCam {
  constructor() { this.tx = 0; this.ty = 0; this.tz = 0; this.dist = 10; this.yaw = 0; this.pitch = 0.9; this.fov = 0.8; this.near = 0.1; this.far = 400; }
  update(vw, vh) {
    const cp = Math.cos(this.pitch);
    this.pos = [this.tx + Math.sin(this.yaw) * cp * this.dist, this.ty + Math.sin(this.pitch) * this.dist, this.tz + Math.cos(this.yaw) * cp * this.dist];
    this.view = M4.lookAt(this.pos, [this.tx, this.ty, this.tz], [0, 1, 0]);
    this.proj = M4.persp(this.fov, vw / vh, this.near, this.far);
    this.vp = M4.mul(this.proj, this.view);
    this.inv = M4.invert(this.vp);
    this.vw = vw; this.vh = vh;
  }
  // screen (viewport-local pixels) -> world ray
  ray(sx, sy) {
    const nx = sx / this.vw * 2 - 1, ny = 1 - sy / this.vh * 2;
    const a = M4.xform(this.inv, nx, ny, -1), b = M4.xform(this.inv, nx, ny, 1);
    const p0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], p1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
    return { o: p0, d: V3.norm(V3.sub(p1, p0)) };
  }
  // world -> screen (viewport-local pixels); returns null when behind the camera
  project(x, y, z) {
    const c = M4.xform(this.vp, x, y, z);
    if (c[3] <= 0.01) return null;
    return [(c[0] / c[3] * 0.5 + 0.5) * this.vw, (1 - (c[1] / c[3] * 0.5 + 0.5)) * this.vh, c[2] / c[3]];
  }
}
