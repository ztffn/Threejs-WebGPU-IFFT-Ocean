'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useControls } from 'leva';
import * as THREE from 'three/webgpu';

export default function TestLightingScene() {
  const { scene, camera } = useThree();
  
  // Test lighting controls
  const { enableTestLights, lightIntensity, blinkSpeed, lookAtLights } = useControls('Test Lighting Scene', {
    enableTestLights: { value: false, label: 'Enable Test Lights' },
    lightIntensity: { value: 1.0, min: 0, max: 5, step: 0.1, label: 'Light Intensity' },
    blinkSpeed: { value: 1.0, min: 0.1, max: 3, step: 0.1, label: 'Blink Speed (Hz)' },
    lookAtLights: { value: false, label: 'Camera Look at Lights' }
  });

  // Create separate group for test lights
  const testGroup = useRef<THREE.Group>();
  const redLight = useRef<THREE.PointLight>();
  const greenLight = useRef<THREE.PointLight>();
  const timeRef = useRef(0);

  // Initialize test lighting group
  useEffect(() => {
    if (!enableTestLights) return;

    // Create group for test lights
    const group = new THREE.Group();
    group.name = 'TestLightingGroup';
    
    // Create red point light (positioned on one side of torus)
    const redPointLight = new THREE.PointLight(0xff0000, lightIntensity, 30);
    redPointLight.position.set(2, 1, 0); // Position near torus
    redPointLight.name = 'RedTestLight';
    
    // Create green point light (positioned on other side of torus)  
    const greenPointLight = new THREE.PointLight(0x00ff00, lightIntensity, 30);
    greenPointLight.position.set(-2, 1, 0); // Position opposite side
    greenPointLight.name = 'GreenTestLight';
    
    // Add visible light helpers for debugging
    const redHelper = new THREE.PointLightHelper(redPointLight, 0.5);
    const greenHelper = new THREE.PointLightHelper(greenPointLight, 0.5);
    
    // Add reflective spheres to see light effects
    const sphereGeometry = new THREE.SphereGeometry(0.3, 32, 32);
    const redSphereMaterial = new THREE.MeshStandardNodeMaterial({ 
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0.9
    });
    const greenSphereMaterial = new THREE.MeshStandardNodeMaterial({ 
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0.9
    });
    
    const redSphere = new THREE.Mesh(sphereGeometry, redSphereMaterial);
    redSphere.position.set(2, 1.5, 0); // Slightly above red light
    redSphere.name = 'RedReflectiveSphere';
    
    const greenSphere = new THREE.Mesh(sphereGeometry, greenSphereMaterial);
    greenSphere.position.set(-2, 1.5, 0); // Slightly above green light
    greenSphere.name = 'GreenReflectiveSphere';
    
    // Add lights, helpers, and spheres to group
    group.add(redPointLight);
    group.add(greenPointLight);
    group.add(redHelper);
    group.add(greenHelper);
    group.add(redSphere);
    group.add(greenSphere);
    
    // Add group to scene
    scene.add(group);
    
    // Store refs
    testGroup.current = group;
    redLight.current = redPointLight;
    greenLight.current = greenPointLight;
    
    console.log('✅ Test lighting scene added');
    console.log('Red light position:', redPointLight.position);
    console.log('Green light position:', greenPointLight.position);
    console.log('Red light intensity:', redPointLight.intensity);
    console.log('Green light intensity:', greenPointLight.intensity);
    console.log('Scene children count:', scene.children.length);
    
    return () => {
      scene.remove(group);
      group.clear();
      console.log('❌ Test lighting scene removed');
    };
  }, [enableTestLights, scene, lightIntensity]);

  // Update light intensities when controls change
  useEffect(() => {
    if (redLight.current) {
      redLight.current.intensity = lightIntensity;
    }
    if (greenLight.current) {
      greenLight.current.intensity = lightIntensity;
    }
  }, [lightIntensity]);

  // Camera control effect
  useEffect(() => {
    if (!lookAtLights) return;
    
    // Position camera to look at the lights area
    camera.position.set(0, 2, 5); // Good viewing angle
    camera.lookAt(0, 1, 0); // Look at center between lights
    console.log('📷 Camera positioned to look at test lights');
    
  }, [lookAtLights, camera]);

  // Animate blinking lights
  useFrame((state, delta) => {
    if (!enableTestLights || !redLight.current || !greenLight.current) return;
    
    timeRef.current += delta * blinkSpeed;
    
    // Create blinking pattern with 1-second states
    const cycle = timeRef.current % 2; // 2-second total cycle
    
    if (cycle < 1) {
      // First second: red on, green off
      redLight.current.intensity = lightIntensity;
      greenLight.current.intensity = 0;
    } else {
      // Second second: red off, green on
      redLight.current.intensity = 0;
      greenLight.current.intensity = lightIntensity;
    }
  });

  return null; // This component only manages lights, no visual elements
}