import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { demoPlots, landmarks, mapBounds, mapPosition, elevationAt, type Geography, type MapPoint } from "./townshipLayout";

export function createTownshipScene(
  host: HTMLDivElement,
  labels: HTMLDivElement,
  data: Geography,
  onSelect: (id: string) => void,
  onUnavailable: () => void,
) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor("#e8e8ea");
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("aria-label", "Putra Heights 3D model. Drag to orbit, scroll to zoom, arrow keys to pan. Select homes using the adjacent household selector.");
  const scene = new THREE.Scene();
  const fog = new THREE.Fog("#e8e8ea", 1500, 2400);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(37, 1, 0.05, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minDistance = 4;
  controls.maxDistance = 2000;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.listenToKeyEvents(renderer.domElement);
  scene.add(new THREE.HemisphereLight("#e9f3ff", "#8b9073", 1.7));
  const sun = new THREE.DirectionalLight("#fff0d3", 2.1);
  sun.position.set(-210, 380, 150);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -350, right: 350, top: 350, bottom: -350, far: 900 });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00003;
  scene.add(sun, sun.target);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string) => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
    return materials.get(color)!;
  };
  const textures: THREE.Texture[] = [];
  const [west, south, east, north] = mapBounds;
  const width = (east - west) * 11116.7, depth = (north - south) * 11132;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 4096;
  const ground = canvas.getContext("2d")!;
  const mask = document.createElement("canvas");
  mask.width = mask.height = 1024;
  const greenery = mask.getContext("2d", { willReadFrequently: true })!;
  const path = (ctx: CanvasRenderingContext2D, points: MapPoint[], close = false) => {
    ctx.beginPath();
    points.forEach(([lon, lat], i) => {
      const x = (lon - west) / (east - west) * ctx.canvas.width;
      const y = (north - lat) / (north - south) * ctx.canvas.height;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    if (close) ctx.closePath();
  };
  const fill = (ctx: CanvasRenderingContext2D, points: MapPoint[], color: string) => {
    path(ctx, points, true); ctx.fillStyle = color; ctx.fill();
  };
  ground.fillStyle = "#97a17b"; ground.fillRect(0, 0, 4096, 4096);
  greenery.fillStyle = "black"; greenery.fillRect(0, 0, 1024, 1024);
  const landColors: Record<string, string> = {
    residential: "#b3b2a2", commercial: "#a7aaa3", retail: "#adaca0", industrial: "#a2aaa5",
    construction: "#c1ae8a", brownfield: "#b2a78c", cemetery: "#92a17a", religious: "#b1b49d",
    forest: "#55724c", wood: "#55724c", scrub: "#7c915e", grassland: "#94a472", grass: "#94a472",
    park: "#8b9e6c", garden: "#829665", recreation_ground: "#839b6b", playground: "#adac87", pitch: "#70976e",
    water: "#678f8b", swimming_pool: "#61b4c4", basin: "#678f8b", reservoir: "#678f8b",
  };
  // Larger land-use areas first, so parks and water remain visible within residential zones.
  const boundsArea = (points: MapPoint[]) => {
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  };
  [...data.areas].sort((a, b) => boundsArea(b.points) - boundsArea(a.points)).forEach((area) => {
    if (landColors[area.kind]) fill(ground, area.points, landColors[area.kind]);
    fill(greenery, area.points, /^(forest|wood|scrub|park|garden|grass|grassland|recreation_ground)$/.test(area.kind) ? "white" : "black");
  });
  const waterKinds = new Set(["river", "stream", "canal", "drain"]);
  const lines = [...data.lines].sort((a, b) => Number(!waterKinds.has(a.kind)) - Number(!waterKinds.has(b.kind)) || Number(a.bridge) - Number(b.bridge));
  lines.forEach((line) => {
    path(ground, line.points);
    ground.lineJoin = ground.lineCap = "round";
    const pixels = line.width / 10 * canvas.width / width;
    ground.lineWidth = pixels + 2;
    ground.strokeStyle = waterKinds.has(line.kind) ? "#829475" : "#c5c3b4";
    ground.stroke();
    ground.lineWidth = Math.max(0.7, pixels);
    ground.strokeStyle = waterKinds.has(line.kind) ? "#628d86" : line.kind === "rail" ? "#5c605c" : /foot|path|cycle/.test(line.kind) ? "#c0b59d" : "#747b78";
    ground.stroke();
    if (/motorway|trunk|primary|secondary|rail/.test(line.kind)) {
      ground.setLineDash(line.kind === "rail" ? [1, 3] : [5, 5]);
      ground.lineWidth = line.kind === "rail" ? Math.max(1, pixels * 0.75) : 0.7;
      ground.strokeStyle = "#dbd7c4"; ground.stroke(); ground.setLineDash([]);
    }
    path(greenery, line.points); greenery.lineWidth = Math.max(2, (line.width + 8) / 10 * mask.width / width);
    greenery.strokeStyle = "black"; greenery.stroke();
  });
  data.buildings.forEach((building) => {
    fill(ground, building.points, "#c6bca6");
    fill(greenery, building.points, "black");
    greenery.lineWidth = 2; greenery.strokeStyle = "black"; greenery.stroke();
  });
  path(ground, data.boundary, true); ground.lineWidth = 2;
  ground.strokeStyle = "#ecede3"; ground.setLineDash([10, 8]); ground.stroke(); ground.setLineDash([]);
  const groundTexture = new THREE.CanvasTexture(canvas);
  groundTexture.colorSpace = THREE.SRGBColorSpace;
  groundTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  textures.push(groundTexture);
  const terrainGeometry = new THREE.PlaneGeometry(width, depth, data.terrain.size - 1, data.terrain.size - 1);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainVertices = terrainGeometry.getAttribute("position");
  data.terrain.heights.forEach((height, i) => terrainVertices.setY(i, height / 10));
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  const windows = document.createElement("canvas");
  windows.width = windows.height = 128;
  const facade = windows.getContext("2d")!;
  facade.fillStyle = "#e0d9c9"; facade.fillRect(0, 0, 128, 128);
  facade.fillStyle = "#c5c0b3"; facade.fillRect(0, 123, 128, 5);
  facade.fillStyle = "#8c9691"; facade.fillRect(31, 35, 66, 52);
  facade.fillStyle = "#506a70"; facade.fillRect(35, 39, 58, 43);
  facade.fillStyle = "#c9d0c9"; facade.fillRect(63, 39, 3, 43);
  facade.fillStyle = "#f2eddf"; facade.fillRect(28, 85, 72, 4);
  const facadeTexture = new THREE.CanvasTexture(windows);
  facadeTexture.wrapS = facadeTexture.wrapT = THREE.RepeatWrapping;
  facadeTexture.colorSpace = THREE.SRGBColorSpace;
  textures.push(facadeTexture);
  const wallMaterial = new THREE.MeshStandardMaterial({ map: facadeTexture, roughness: 0.85, side: THREE.DoubleSide });
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const batch = (geometry: THREE.BufferGeometry, mat: THREE.Material) => {
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat)!.push(geometry);
  };
  const geometry = (vertices: number[], uv: number[]) => {
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    result.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    result.computeVertexNormals();
    return result;
  };
  // Vector road surfaces keep street edges sharp at household zoom.
  const streetSurfaces = new Map<string, number[]>();
  lines.filter((line) => !waterKinds.has(line.kind)).forEach((line) => {
    const vertices: number[] = [];
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i];
      const [ax, az] = mapPosition(a), [bx, bz] = mapPosition(b);
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.001) continue;
      const nx = -(bz - az) / length * line.width / 20, nz = (bx - ax) / length * line.width / 20;
      const steps = Math.ceil(length);
      const edge = (t: number, side: number) => {
        const x = ax + (bx - ax) * t + nx * side, z = az + (bz - az) * t + nz * side;
        const point: MapPoint = [(west + east) / 2 + x / 11116.7, (north + south) / 2 - z / 11132];
        return [x, elevationAt(data, point) + 0.025, z];
      };
      for (let step = 0; step < steps; step++) {
        const a = edge(step / steps, -1), b = edge(step / steps, 1);
        const c = edge((step + 1) / steps, -1), d = edge((step + 1) / steps, 1);
        if (![a, b, c, d].every(([x, , z]) => Math.abs(x) <= width / 2 && Math.abs(z) <= depth / 2)) continue;
        vertices.push(...a, ...b, ...c, ...b, ...d, ...c);
      }
    }
    const color = line.kind === "rail" ? "#616864" : /foot|path|cycle/.test(line.kind) ? "#c0b59d" : "#747b78";
    if (!streetSurfaces.has(color)) streetSurfaces.set(color, []);
    const surface = streetSurfaces.get(color)!;
    for (const value of vertices) surface.push(value);
  });
  streetSurfaces.forEach((vertices, color) => {
    const mesh = new THREE.Mesh(geometry(vertices, new Array(vertices.length / 3 * 2).fill(0)), material(color));
    mesh.receiveShadow = true; scene.add(mesh);
  });
  const homes = new Map<string, { position: THREE.Vector3; roof: THREE.Mesh; outline: THREE.LineLoop; naturalColor: string }>();
  const plotsByBuilding = new Map(demoPlots.map((plot) => [plot.buildingId, plot]));
  const pickable: THREE.Object3D[] = [];
  const anchors: { key: string; point: THREE.Vector3; landmark: boolean }[] = [];
  data.buildings.forEach((building) => {
    const points = building.points.map(mapPosition);
    const center: MapPoint = [building.points.reduce((sum, p) => sum + p[0], 0) / points.length, building.points.reduce((sum, p) => sum + p[1], 0) / points.length];
    const groundLevel = elevationAt(data, center), height = building.height / 10;
    const bottom = Math.min(groundLevel, ...building.points.map((p) => elevationAt(data, p))) - 0.08;
    const top = Math.max(groundLevel, ...building.points.map((p) => elevationAt(data, p))) + height;
    const wallVertices: number[] = [], wallUV: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const u = Math.hypot(a[0] - b[0], a[1] - b[1]) / 0.35, v = (top - bottom) / 0.31;
      wallVertices.push(a[0], bottom, a[1], b[0], bottom, b[1], b[0], top, b[1], a[0], bottom, a[1], b[0], top, b[1], a[0], top, a[1]);
      wallUV.push(0, 0, u, 0, u, v, 0, 0, u, v, 0, v);
    }
    const residential = /^(house|yes|detached|semidetached_house|bungalow|terrace)$/.test(building.kind) && height < 1.5;
    const naturalColor = residential ? ["#a7684e", "#a57a5c", "#876454", "#bc805f"][Math.floor(building.id / 11) % 4] : /industrial|warehouse|roof/.test(building.kind) ? "#859695" : "#b4b2a5";
    const roofVertices: number[] = [], roofUV: number[] = [];
    const triangle = (a: number[], b: number[], c: number[]) => {
      roofVertices.push(...a, ...b, ...c);
      roofUV.push(a[0], a[2], b[0], b[2], c[0], c[2]);
    };
    // shortcut: roof pitch and façades are inferred; replace with surveyed models when available.
    if (residential && points.length === 4) {
      let start = 0;
      if (new THREE.Vector2(...points[0]).distanceTo(new THREE.Vector2(...points[1])) < new THREE.Vector2(...points[1]).distanceTo(new THREE.Vector2(...points[2]))) start = 1;
      const [a, b, c, d] = points.map((_, i) => points[(i + start) % 4]).map(([x, z]) => [x, top, z]);
      const r = [(a[0] + b[0]) / 2, top + 0.18, (a[2] + b[2]) / 2];
      const s = [(c[0] + d[0]) / 2, top + 0.18, (c[2] + d[2]) / 2];
      triangle(a, r, d); triangle(r, s, d); triangle(r, b, c); triangle(r, c, s); triangle(a, b, r); triangle(c, d, s);
    } else {
      const triangles = THREE.ShapeUtils.triangulateShape(points.map(([x, z]) => new THREE.Vector2(x, z)), []);
      triangles.forEach((indices) => triangle(...indices.map((i) => [points[i][0], top, points[i][1]]) as [number[], number[], number[]]));
    }
    const walls = geometry(wallVertices, wallUV), roof = geometry(roofVertices, roofUV);
    const plot = plotsByBuilding.get(building.id);
    const wallsMat = /industrial|warehouse|roof/.test(building.kind) ? material("#c3c5be") : wallMaterial;
    if (plot) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(walls, wallsMat);
      const roofMesh = new THREE.Mesh(roof, material(naturalColor).clone());
      body.castShadow = roofMesh.castShadow = true;
      body.receiveShadow = roofMesh.receiveShadow = true;
      group.add(body, roofMesh);
      const [x, z] = mapPosition(plot.point);
      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points.map(([px, pz]) => new THREE.Vector3(px, top + 0.03, pz))),
        new THREE.LineBasicMaterial({ color: "#ffffff" }),
      );
      group.add(outline);
      group.traverse((object) => { object.userData.household = plot.id; });
      scene.add(group); pickable.push(body, roofMesh);
      const roofLevel = top + (residential && points.length === 4 ? 0.18 : 0);
      const position = new THREE.Vector3(x, roofLevel + 0.03, z);
      homes.set(plot.id, { position, roof: roofMesh, outline, naturalColor });
      anchors.push({ key: plot.id, point: position, landmark: false });
    } else {
      batch(walls, wallsMat); batch(roof, material(naturalColor));
    }
  });
  batches.forEach((items, mat) => {
    const combined = mergeGeometries(items)!;
    items.forEach((item) => item.dispose());
    const mesh = new THREE.Mesh(combined, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  });

  const maskPixels = greenery.getImageData(0, 0, 1024, 1024).data;
  const trees: { point: MapPoint; scale: number }[] = [];
  for (let z = 3; z < depth - 3; z += 1.7) {
    for (let x = 3; x < width - 3; x += 1.7) {
      const jitter = Math.sin(x * 7.31 + z * 91.7) * 0.6;
      const mx = Math.floor((x + jitter) / width * 1024), my = Math.floor((z - jitter) / depth * 1024);
      if (maskPixels[(my * 1024 + mx) * 4] > 200) trees.push({ point: [west + (x + jitter) / width * (east - west), north - (z - jitter) / depth * (north - south)], scale: 0.45 + (jitter + 0.6) * 0.38 });
    }
  }
  const treeGeometry = new THREE.IcosahedronGeometry(1, 1);
  const treeMesh = new THREE.InstancedMesh(treeGeometry, material("#ffffff"), trees.length);
  const dummy = new THREE.Object3D();
  trees.forEach(({ point, scale }, i) => {
    const [x, z] = mapPosition(point);
    dummy.position.set(x, elevationAt(data, point) + scale * 0.7, z);
    dummy.scale.set(scale, scale * 1.2, scale); dummy.rotation.y = i; dummy.updateMatrix();
    treeMesh.setMatrixAt(i, dummy.matrix);
    treeMesh.setColorAt(i, new THREE.Color(["#536f43", "#68804d", "#758959", "#415f3b"][i % 4]));
  });
  treeMesh.castShadow = treeMesh.receiveShadow = true; scene.add(treeMesh);
  landmarks.forEach(({ name, point, sourceId }) => {
    const [x, z] = mapPosition(point), building = data.buildings.find((b) => b.id === sourceId);
    anchors.push({ key: name, point: new THREE.Vector3(x, elevationAt(data, point) + (building?.height ?? 10) / 10 + 0.5, z), landmark: true });
  });
  host.appendChild(renderer.domElement);

  let selected = "";
  let flagged = "";
  let available = new Set<string>();
  let showReadings = false;
  let overview = true;
  let topView = true;
  let disposed = false;
  let visible = true;
  let frame = 0;
  const projected = new THREE.Vector3();
  const render = () => {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    const shadowExtent = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target), 12, 350);
    sun.target.position.copy(controls.target);
    sun.position.copy(controls.target).add(new THREE.Vector3(-210, 380, 150));
    Object.assign(sun.shadow.camera, { left: -shadowExtent, right: shadowExtent, top: shadowExtent, bottom: -shadowExtent });
    sun.shadow.camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const width = host.clientWidth, height = host.clientHeight;
    const origin = host.getBoundingClientRect();
    const occupied = Array.from(host.closest("dialog")!.querySelectorAll<HTMLElement>("[data-map-obstacle]")).filter((panel) => panel.checkVisibility()).map((panel) => {
      const rect = panel.getBoundingClientRect();
      return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height };
    });
    const priority = (key: string, landmark: boolean) => key === flagged ? 0 : key === selected ? 1 : landmark ? 3 : 2;
    const ordered = [...anchors].sort((a, b) => priority(a.key, a.landmark) - priority(b.key, b.landmark));
    for (const anchor of ordered) {
      const el = labels.querySelector<HTMLElement>(`[data-anchor="${anchor.key}"]`);
      if (!el) continue;
      const leader = labels.querySelector<SVGLineElement>(`[data-leader="${anchor.key}"]`);
      if (leader) leader.style.display = "none";
      projected.copy(anchor.point).project(camera);
      const x = (projected.x + 1) / 2 * width, y = (1 - projected.y) / 2 * height;
      const inFrame = projected.z > -1 && projected.z < 1 && x > 10 && x < width - 10 && y > 85 && y < height - 75;
      el.style.display = inFrame ? "" : "none";
      if (!inFrame) continue;
      el.style.transform = anchor.landmark ? `translate(${x}px, ${y}px) translate(-50%, -100%)` : `translate(${x - 7}px, ${y - 7}px)`;
      el.style.zIndex = anchor.key === flagged ? "6" : anchor.key === selected ? "5" : anchor.landmark ? "1" : "2";
      const labelWidth = anchor.landmark ? Math.max(130, el.offsetWidth) : 140, labelHeight = anchor.landmark ? 24 : 91;
      let placement: { x: number; y: number; width: number; height: number } | undefined;
      const show = anchor.landmark || showReadings || anchor.key === selected || anchor.key === flagged;
      // Fan out dense household cards with leaders; their dots stay on the actual footprints.
      for (let radius = 0; show && !placement && radius <= (anchor.landmark ? 0 : 4); radius++) {
        const candidates: { dx: number; dy: number }[] = [];
        for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) candidates.push({ dx, dy });
        }
        candidates.sort((a, b) => Math.hypot(a.dx * 152, a.dy * 103) - Math.hypot(b.dx * 152, b.dy * 103));
        for (const { dx, dy } of candidates) {
          const rect = { x: x - labelWidth / 2 + dx * 152, y: y - labelHeight - 14 + dy * 103, width: labelWidth, height: labelHeight };
          if (rect.x < 14 || rect.x + rect.width > width - 14 || rect.y < 94 || rect.y + rect.height > height - 85) continue;
          if (occupied.some((r) => rect.x < r.x + r.width + 7 && rect.x + rect.width + 7 > r.x && rect.y < r.y + r.height + 7 && rect.y + rect.height + 7 > r.y)) continue;
          placement = rect; break;
        }
      }
      el.classList.toggle("map-label-collapsed", !placement);
      if (anchor.landmark) el.style.display = placement ? "" : "none";
      if (placement) {
        occupied.push(placement);
        if (!anchor.landmark) {
          const cx = placement.x + labelWidth / 2, cy = placement.y + labelHeight;
          el.style.setProperty("--label-x", `${cx - x + 7}px`);
          el.style.setProperty("--label-y", `${cy - y + 7}px`);
          if (leader) {
            leader.setAttribute("x1", String(x)); leader.setAttribute("y1", String(y));
            leader.setAttribute("x2", String(cx)); leader.setAttribute("y2", String(cy));
            leader.style.display = "";
          }
        }
      } else {
        el.style.setProperty("--label-x", "7px"); el.style.setProperty("--label-y", "-5px");
      }
    }
  };
  const invalidate = () => { if (!frame && !disposed) frame = requestAnimationFrame(render); };
  const frameArea = () => {
    const viewport = host.getBoundingClientRect();
    const root = host.closest("dialog")!;
    const bounds = { left: 20, right: viewport.width - 20, top: 85, bottom: viewport.height - 75 };
    const rect = (selector: string) => {
      const element = root.querySelector<HTMLElement>(selector);
      return element?.checkVisibility() ? element.getBoundingClientRect() : null;
    };
    const options = rect(".explorer-map-options");
    if (options) bounds.top = options.bottom - viewport.top + 16;
    const trend = rect(".explorer-trends");
    if (trend) bounds.bottom = trend.top - viewport.top - 20;
    if (viewport.width > 1000) {
      const left = rect(".explorer-left"), right = rect(".explorer-inspector");
      if (left) bounds.left = left.right - viewport.left + 16;
      if (right) bounds.right = right.left - viewport.left - 16;
    }
    // Keep the township centered in the open map area between the floating controls.
    camera.setViewOffset(viewport.width, viewport.height,
      viewport.width / 2 - (bounds.left + bounds.right) / 2,
      viewport.height / 2 - (bounds.top + bounds.bottom) / 2,
      viewport.width, viewport.height);
    return { viewport, bounds };
  };
  const reset = (top = true) => {
    overview = true; topView = top;
    scene.fog = top ? null : fog;
    controls.enableRotate = !top;
    controls.mouseButtons.LEFT = top ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE = top ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    controls.touches.TWO = top ? THREE.TOUCH.DOLLY_PAN : THREE.TOUCH.DOLLY_ROTATE;
    renderer.domElement.setAttribute("aria-label", `Putra Heights 3D model. ${top ? "Landscape top view, north points right. Drag to pan" : "Drag to orbit"}, scroll to zoom, arrow keys to pan. Select homes using the adjacent household selector.`);
    const monitoredBounds = new THREE.Box3().setFromPoints(anchors.filter((anchor) => !anchor.landmark).map((anchor) => anchor.point)).expandByScalar(16);
    monitoredBounds.getCenter(controls.target);
    const { viewport, bounds } = frameArea();
    // Face west in top view so the township's north–south axis runs across the screen.
    const direction = new THREE.Vector3(top ? 0.1 : 170, top ? 240 : 185, top ? 0 : 180).normalize();
    const corners = [monitoredBounds.min.x, monitoredBounds.max.x].flatMap((x) =>
      [monitoredBounds.min.y, monitoredBounds.max.y].flatMap((y) =>
        [monitoredBounds.min.z, monitoredBounds.max.z].map((z) => new THREE.Vector3(x, y, z))));
    for (let distance = 600; distance <= 1980; distance += 30) {
      camera.position.copy(direction).multiplyScalar(distance).add(controls.target);
      controls.update(); camera.updateMatrixWorld();
      if (corners.every((corner) => {
        const p = corner.clone().project(camera);
        const x = (p.x + 1) / 2 * viewport.width, y = (1 - p.y) / 2 * viewport.height;
        return x > bounds.left && x < bounds.right && y > bounds.top && y < bounds.bottom;
      })) break;
    }
    invalidate();
  };
  const resize = () => {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    if (overview) reset(topView);
    else frameArea();
    invalidate();
  };
  controls.addEventListener("start", () => { overview = false; });
  controls.addEventListener("change", invalidate);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  host.closest("dialog")!.querySelectorAll("[data-map-obstacle]").forEach((element) => observer.observe(element));
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) invalidate(); });
  intersection.observe(host);
  document.addEventListener("visibilitychange", invalidate);
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let pointerStart: { x: number; y: number } | null = null;
  const down = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY }; };
  const up = (event: PointerEvent) => {
    if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickable, true)[0];
    if (hit && available.has(hit.object.userData.household)) onSelect(hit.object.userData.household);
    pointerStart = null;
  };
  const lost = (event: Event) => { event.preventDefault(); onUnavailable(); };
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointerup", up);
  renderer.domElement.addEventListener("webglcontextlost", lost);
  reset(); resize();
  return {
    reset,
    zoom: (factor: number) => {
      overview = false;
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset);
      controls.update(); invalidate();
    },
    focus: (id: string) => {
      const home = homes.get(id);
      if (!home) return;
      overview = false;
      controls.target.copy(home.position);
      camera.position.copy(home.position).add(topView ? new THREE.Vector3(0.01, 18, 0) : new THREE.Vector3(3.7, 4.5, 5));
      controls.update(); invalidate();
    },
    update: (values: Map<string, string>, household: string, readings: boolean, concern: string | undefined) => {
      selected = household; flagged = concern ?? ""; showReadings = readings; available = new Set(values.keys());
      homes.forEach((home, id) => {
        const value = values.get(id);
        const roofMaterial = home.roof.material as THREE.MeshStandardMaterial;
        roofMaterial.color.set(id === flagged ? "#bd334d" : value ?? home.naturalColor);
        roofMaterial.emissive.set(id === flagged ? "#bd334d" : "#000000");
        roofMaterial.emissiveIntensity = 0.2;
        home.outline.visible = value !== undefined;
        (home.outline.material as THREE.LineBasicMaterial).color.set(id === concern ? "#bd334d" : id === household ? "#231f20" : "#ffffff");
      });
      invalidate();
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect(); intersection.disconnect(); controls.dispose();
      document.removeEventListener("visibilitychange", invalidate);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      const geometries = new Set<THREE.BufferGeometry>();
      const usedMaterials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => usedMaterials.add(m));
          if (object instanceof THREE.InstancedMesh) object.dispose();
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => usedMaterials.add(m));
      usedMaterials.forEach((m) => m.dispose());
      textures.forEach((texture) => texture.dispose());
      sun.shadow.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
