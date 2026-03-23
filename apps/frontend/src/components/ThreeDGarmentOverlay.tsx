import { useEffect, useMemo, useRef } from 'react';
import type { PoseLandmarks, PosePoint } from '../types/fitting';

type ThreeDGarmentOverlayProps = {
  objUrl: string;
  frameWidth: number;
  frameHeight: number;
  landmarks: PoseLandmarks | null;
  visible: boolean;
};

type Vec3 = {
  x: number;
  y: number;
  z: number;
};

type Triangle = [number, number, number];

type ObjMesh = {
  vertices: Vec3[];
  faces: Triangle[];
};

type ProjectedTriangle = {
  points: Array<{ x: number; y: number }>;
  shade: number;
  depth: number;
};

export function ThreeDGarmentOverlay({
  objUrl,
  frameWidth,
  frameHeight,
  landmarks,
  visible
}: ThreeDGarmentOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const meshRef = useRef<ObjMesh | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMesh() {
      try {
        const response = await fetch(objUrl);
        if (!response.ok) {
          throw new Error(`Failed to load OBJ (${response.status})`);
        }

        const source = await response.text();
        const mesh = normalizeMesh(parseObj(source));
        if (!cancelled) {
          meshRef.current = mesh;
          drawOverlay(canvasRef.current, mesh, frameWidth, frameHeight, landmarks, visible);
        }
      } catch {
        if (!cancelled) {
          meshRef.current = null;
          drawOverlay(canvasRef.current, null, frameWidth, frameHeight, landmarks, false);
        }
      }
    }

    void loadMesh();

    return () => {
      cancelled = true;
    };
  }, [objUrl]);

  const drawKey = useMemo(
    () =>
      JSON.stringify({
        frameWidth,
        frameHeight,
        visible,
        landmarks
      }),
    [frameHeight, frameWidth, landmarks, visible]
  );

  useEffect(() => {
    drawOverlay(canvasRef.current, meshRef.current, frameWidth, frameHeight, landmarks, visible);
  }, [drawKey, frameHeight, frameWidth, landmarks, visible]);

  return <canvas ref={canvasRef} className="three-d-overlay" />;
}

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  mesh: ObjMesh | null,
  frameWidth: number,
  frameHeight: number,
  landmarks: PoseLandmarks | null,
  visible: boolean
) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  if (canvas.width !== frameWidth || canvas.height !== frameHeight) {
    canvas.width = frameWidth;
    canvas.height = frameHeight;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  if (!visible || !mesh || !landmarks || frameWidth === 0 || frameHeight === 0) {
    return;
  }

  const projected = projectMesh(mesh, landmarks);
  for (const triangle of projected) {
    context.beginPath();
    context.moveTo(triangle.points[0].x, triangle.points[0].y);
    context.lineTo(triangle.points[1].x, triangle.points[1].y);
    context.lineTo(triangle.points[2].x, triangle.points[2].y);
    context.closePath();
    context.fillStyle = `rgba(122, 72, 42, ${triangle.shade.toFixed(3)})`;
    context.fill();
    context.strokeStyle = 'rgba(58, 31, 16, 0.12)';
    context.lineWidth = 0.6;
    context.stroke();
  }
}

function projectMesh(mesh: ObjMesh, landmarks: PoseLandmarks): ProjectedTriangle[] {
  const shoulderMid = midpoint(landmarks.left_shoulder, landmarks.right_shoulder);
  const hipMid = midpoint(landmarks.left_hip, landmarks.right_hip);
  const shoulderSpan = distance(landmarks.left_shoulder, landmarks.right_shoulder);
  const torsoHeight = Math.max(distance(shoulderMid, hipMid), shoulderSpan * 0.9);
  const center = midpoint(shoulderMid, hipMid);
  const roll = Math.atan2(
    landmarks.right_shoulder.y - landmarks.left_shoulder.y,
    landmarks.right_shoulder.x - landmarks.left_shoulder.x
  );
  const yaw = clamp((hipMid.x - shoulderMid.x) / Math.max(shoulderSpan, 1), -0.28, 0.28);
  const pitch = clamp((hipMid.y - shoulderMid.y) / Math.max(torsoHeight, 1) - 1, -0.18, 0.2);
  const scaleX = shoulderSpan * 1.3;
  const scaleY = torsoHeight * 1.95;
  const scaleZ = shoulderSpan * 0.9;
  const cameraDepth = 3.1;
  const perspective = shoulderSpan * 1.65;

  const transformedVertices = mesh.vertices.map((vertex) => {
    let next = { ...vertex };
    next = rotateX(next, -0.18 + pitch);
    next = rotateY(next, yaw);
    next = rotateZ(next, roll);
    next = {
      x: center.x + next.x * scaleX,
      y: center.y + next.y * scaleY,
      z: next.z * scaleZ
    };

    const factor = perspective / Math.max(0.6, cameraDepth - next.z);
    return {
      x: center.x + (next.x - center.x) * factor,
      y: center.y + (next.y - center.y) * factor,
      z: next.z
    };
  });

  const triangles: ProjectedTriangle[] = [];
  for (const [a, b, c] of mesh.faces) {
    const p1 = transformedVertices[a];
    const p2 = transformedVertices[b];
    const p3 = transformedVertices[c];
    const normal = computeNormal(p1, p2, p3);

    if (normal.z <= 0) {
      continue;
    }

    const shade = 0.24 + clamp(normal.z, 0, 1) * 0.56;
    triangles.push({
      points: [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p2.y },
        { x: p3.x, y: p3.y }
      ],
      shade,
      depth: (p1.z + p2.z + p3.z) / 3
    });
  }

  triangles.sort((left, right) => left.depth - right.depth);
  return triangles;
}

function parseObj(source: string): ObjMesh {
  const vertices: Vec3[] = [];
  const faces: Triangle[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.split(/\s+/);
      vertices.push({
        x: Number.parseFloat(x),
        y: Number.parseFloat(y),
        z: Number.parseFloat(z)
      });
      continue;
    }

    if (!line.startsWith('f ')) {
      continue;
    }

    const tokens = line
      .slice(2)
      .trim()
      .split(/\s+/)
      .map((token) => Number.parseInt(token.split('/')[0], 10) - 1)
      .filter((index) => Number.isFinite(index) && index >= 0);

    for (let index = 1; index < tokens.length - 1; index += 1) {
      faces.push([tokens[0], tokens[index], tokens[index + 1]]);
    }
  }

  return { vertices, faces };
}

function normalizeMesh(mesh: ObjMesh): ObjMesh {
  if (mesh.vertices.length === 0) {
    return mesh;
  }

  const bounds = mesh.vertices.reduce(
    (accumulator, vertex) => ({
      minX: Math.min(accumulator.minX, vertex.x),
      maxX: Math.max(accumulator.maxX, vertex.x),
      minY: Math.min(accumulator.minY, vertex.y),
      maxY: Math.max(accumulator.maxY, vertex.y),
      minZ: Math.min(accumulator.minZ, vertex.z),
      maxZ: Math.max(accumulator.maxZ, vertex.z)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY
    }
  );

  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2
  };
  const maxDimension = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ,
    0.001
  );

  return {
    vertices: mesh.vertices.map((vertex) => ({
      x: (vertex.x - center.x) / maxDimension,
      y: (vertex.y - center.y) / maxDimension,
      z: (vertex.z - center.z) / maxDimension
    })),
    faces: mesh.faces
  };
}

function midpoint(left: PosePoint, right: PosePoint): PosePoint {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2
  };
}

function distance(left: PosePoint, right: PosePoint) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function rotateX(vector: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: vector.x,
    y: vector.y * cos - vector.z * sin,
    z: vector.y * sin + vector.z * cos
  };
}

function rotateY(vector: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: vector.x * cos + vector.z * sin,
    y: vector.y,
    z: -vector.x * sin + vector.z * cos
  };
}

function rotateZ(vector: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
    z: vector.z
  };
}

function computeNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = {
    x: b.x - a.x,
    y: b.y - a.y,
    z: b.z - a.z
  };
  const ac = {
    x: c.x - a.x,
    y: c.y - a.y,
    z: c.z - a.z
  };

  const normal = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x
  };
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
