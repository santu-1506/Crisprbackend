import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Animated DNA double-helix using parametric geometry.
 * Two intertwined sine curves + connecting "rungs" represent base pairs.
 * Used as a subtle fixed background — pointer-events: none.
 */
function DoubleHelix({ count = 60, radius = 1.2, height = 14, color1 = '#00d9ff', color2 = '#a855f7' }) {
  const groupRef = useRef();

  // Generate strand positions
  const { strand1, strand2, rungs } = useMemo(() => {
    const s1 = [];
    const s2 = [];
    const r  = [];
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const angle = t * Math.PI * 6;          // 3 full turns
      const y = (t - 0.5) * height;
      s1.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
      s2.push(new THREE.Vector3(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius));
      if (i % 2 === 0) {
        r.push([s1[i], s2[i]]);
      }
    }
    return { strand1: s1, strand2: s2, rungs: r };
  }, [count, radius, height]);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Strand 1 spheres */}
      {strand1.map((p, i) => (
        <mesh key={`s1-${i}`} position={p}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color={color1} transparent opacity={0.85} />
        </mesh>
      ))}

      {/* Strand 2 spheres */}
      {strand2.map((p, i) => (
        <mesh key={`s2-${i}`} position={p}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color={color2} transparent opacity={0.85} />
        </mesh>
      ))}

      {/* Rungs (base pairs) */}
      {rungs.map(([a, b], i) => {
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const dir = b.clone().sub(a);
        const len = dir.length();
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize()
        );
        return (
          <mesh
            key={`r-${i}`}
            position={mid}
            quaternion={quat}
          >
            <cylinderGeometry args={[0.015, 0.015, len, 8]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.18} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Floating sphere particles for ambience.
 */
function Particles({ count = 80 }) {
  const ref = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 20;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 20;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return arr;
  }, [count]);

  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.03;
      ref.current.rotation.x += delta * 0.01;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#a855f7"
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

/**
 * Fixed background canvas for landing/hero pages.
 * Pointer-events disabled so it never blocks UI.
 */
export default function DNAHelixBackground({ intensity = 0.6, className = '' }) {
  return (
    <div
      className={`fixed inset-0 pointer-events-none ${className}`}
      style={{ zIndex: 0, opacity: intensity }}
    >
      <Canvas
        camera={{ position: [0, 0, 7], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={0.8} color="#a855f7" />
        <DoubleHelix />
        <Particles count={60} />
      </Canvas>
    </div>
  );
}
