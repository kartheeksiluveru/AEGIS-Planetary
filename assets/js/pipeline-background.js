const canvas = document.querySelector('.aegis-pipeline-canvas')

if (canvas) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  async function createScene() {
    try {
      const THREE = await import('https://unpkg.com/three@0.164.1/build/three.module.js')
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35))
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.1
      renderer.setClearColor(0x000000, 0)

      const scene = new THREE.Scene()
      scene.fog = new THREE.FogExp2('#0a0f24', 0.018)
      const camera = new THREE.PerspectiveCamera(39, window.innerWidth / window.innerHeight, 0.1, 100)
      camera.position.set(0, 0, 12.8)

      scene.add(new THREE.AmbientLight('#7792c0', 1.2))
      const keyLight = new THREE.DirectionalLight('#b8e8ff', 2.5)
      keyLight.position.set(-5, 3, 7)
      scene.add(keyLight)
      const rimLight = new THREE.PointLight('#167dff', 38, 18)
      rimLight.position.set(4, -2, -3)
      scene.add(rimLight)
      const cyanLight = new THREE.PointLight('#41eaff', 18, 13)
      cyanLight.position.set(-3, 2, 3)
      scene.add(cyanLight)

      const root = new THREE.Group()
      scene.add(root)
      const earthGroup = new THREE.Group()
      root.add(earthGroup)
      const radius = 2.05

      const textureCanvas = document.createElement('canvas')
      textureCanvas.width = 768
      textureCanvas.height = 384
      const context = textureCanvas.getContext('2d')
      const ocean = context.createLinearGradient(0, 0, 0, textureCanvas.height)
      ocean.addColorStop(0, '#071d39')
      ocean.addColorStop(0.5, '#0b4670')
      ocean.addColorStop(1, '#06162f')
      context.fillStyle = ocean
      context.fillRect(0, 0, textureCanvas.width, textureCanvas.height)

      let seed = 27891
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return seed / 4294967296
      }
      for (let index = 0; index < 1400; index += 1) {
        context.fillStyle = random() > 0.5 ? 'rgba(70,190,230,.12)' : 'rgba(5,22,49,.14)'
        context.fillRect(random() * 768, random() * 384, random() * 4 + 1, random() * 3 + 1)
      }

      function drawLand(points, color) {
        context.beginPath()
        points.forEach(([x, y], index) => index === 0 ? context.moveTo(x, y) : context.lineTo(x, y))
        context.closePath()
        context.fillStyle = color
        context.fill()
        context.strokeStyle = 'rgba(103,238,205,.35)'
        context.lineWidth = 1.2
        context.stroke()
      }

      drawLand([[78,79],[112,52],[154,51],[183,68],[206,96],[190,120],[168,132],[153,164],[128,181],[117,151],[94,132],[77,104]], '#227f76')
      drawLand([[162,176],[187,184],[199,216],[190,252],[174,286],[157,265],[149,229]], '#258e79')
      drawLand([[315,82],[342,64],[373,71],[394,91],[426,96],[438,120],[419,139],[394,132],[378,156],[359,142],[342,116],[321,112]], '#268b7c')
      drawLand([[360,157],[386,165],[405,190],[399,225],[382,262],[364,242],[353,211]], '#2d9a7d')
      drawLand([[431,81],[476,55],[532,68],[561,94],[548,121],[511,128],[491,157],[463,140],[443,115]], '#278c79')
      drawLand([[525,168],[553,163],[570,186],[562,218],[539,230],[524,205]], '#248573')
      drawLand([[600,245],[625,233],[642,253],[630,272],[610,267]], '#23806f')
      drawLand([[41,225],[67,212],[83,229],[72,247],[48,249]], '#21796f')

      const earthTexture = new THREE.CanvasTexture(textureCanvas)
      earthTexture.colorSpace = THREE.SRGBColorSpace
      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 56, 44),
        new THREE.MeshStandardMaterial({
          map: earthTexture,
          roughness: 0.88,
          metalness: 0.04,
          emissive: '#05233d',
          emissiveIntensity: 0.28,
        }),
      )
      earthGroup.add(earth)

      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.075, 48, 36),
        new THREE.ShaderMaterial({
          vertexShader: 'varying vec3 vNormal; varying vec3 vView; void main(){vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
          fragmentShader: 'varying vec3 vNormal; varying vec3 vView; void main(){float rim=pow(1.-max(dot(normalize(vNormal),normalize(vView)),0.),3.0);gl_FragColor=vec4(vec3(.10,.62,1.0),rim*.7);}',
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      )
      earthGroup.add(atmosphere)

      const grid = new THREE.Group()
      const gridMaterial = new THREE.LineBasicMaterial({ color: '#48cfff', transparent: true, opacity: 0.12 })
      for (let latitude = -60; latitude <= 60; latitude += 30) {
        const points = []
        const phi = latitude * Math.PI / 180
        for (let index = 0; index <= 120; index += 1) {
          const theta = index / 120 * Math.PI * 2
          points.push(new THREE.Vector3(
            radius * 1.008 * Math.cos(phi) * Math.cos(theta),
            radius * 1.008 * Math.sin(phi),
            radius * 1.008 * Math.cos(phi) * Math.sin(theta),
          ))
        }
        grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial))
      }
      for (let longitude = 0; longitude < 180; longitude += 30) {
        const points = []
        const theta = longitude * Math.PI / 180
        for (let index = 0; index <= 80; index += 1) {
          const phi = -Math.PI / 2 + index / 80 * Math.PI
          points.push(new THREE.Vector3(
            radius * 1.009 * Math.cos(phi) * Math.cos(theta),
            radius * 1.009 * Math.sin(phi),
            radius * 1.009 * Math.cos(phi) * Math.sin(theta),
          ))
        }
        grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial))
      }
      earthGroup.add(grid)

      const starGeometry = new THREE.BufferGeometry()
      const starPositions = []
      for (let index = 0; index < 900; index += 1) {
        starPositions.push((random() - 0.5) * 42, (random() - 0.5) * 26, -random() * 24 - 4)
      }
      starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
      const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
        color: '#9bcfff', size: 0.022, transparent: true, opacity: 0.6, sizeAttenuation: true,
      }))
      scene.add(stars)

      const shells = new THREE.Group()
      root.add(shells)
      const shellColors = ['#4d8cff', '#36b7ff', '#64eaff', '#b0faff']
      const shellMeshes = shellColors.map((color, index) => {
        const shell = new THREE.Mesh(
          new THREE.SphereGeometry(radius * (1.2 + index * 0.105), 36, 28),
          new THREE.MeshBasicMaterial({
            color,
            wireframe: true,
            transparent: true,
            opacity: 0.026 + index * 0.009,
            depthWrite: false,
          }),
        )
        shell.rotation.set(index * 0.34, index * 0.58, index * 0.19)
        shells.add(shell)
        return shell
      })

      const anchors = [
        new THREE.Vector3(-2.55, 1.1, 0.2),
        new THREE.Vector3(-1.4, -1.15, 0.3),
        new THREE.Vector3(1.4, 1, 0.2),
        new THREE.Vector3(2.65, -0.55, 0.1),
      ]
      const anchorMeshes = anchors.map((position) => {
        const marker = new THREE.Group()
        marker.position.copy(position)
        marker.add(new THREE.Mesh(
          new THREE.TorusGeometry(0.17, 0.008, 6, 40),
          new THREE.MeshBasicMaterial({ color: '#65eaff', transparent: true, opacity: 0.6 }),
        ))
        marker.add(new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 10, 10),
          new THREE.MeshBasicMaterial({ color: '#d7fbff' }),
        ))
        root.add(marker)
        return marker
      })

      const arcs = new THREE.Group()
      for (let segment = 0; segment < anchors.length - 1; segment += 1) {
        const points = []
        for (let index = 0; index <= 64; index += 1) {
          const t = index / 64
          const point = anchors[segment].clone().lerp(anchors[segment + 1], t)
          point.y += Math.sin(t * Math.PI) * (segment % 2 === 0 ? 0.45 : -0.45)
          points.push(point)
        }
        arcs.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: '#39cfff', transparent: true, opacity: 0.2 }),
        ))
      }
      root.add(arcs)

      const particleCount = 96
      const particlePositions = new Float32Array(particleCount * 3)
      const particleGeometry = new THREE.BufferGeometry()
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
      const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
        color: '#80f3ff', size: 0.03, transparent: true, opacity: 0.75,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }))
      root.add(particles)

      const scanner = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 1.3),
        new THREE.MeshBasicMaterial({
          color: '#48eaff', transparent: true, opacity: 0.09, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      )
      scanner.rotation.set(0.4, 0.7, 0.2)
      root.add(scanner)

      function resize() {
        const isNarrow = window.innerWidth < 760
        camera.aspect = window.innerWidth / window.innerHeight
        camera.fov = isNarrow ? 48 : 39
        camera.updateProjectionMatrix()
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isNarrow ? 1.1 : 1.35))
        renderer.setSize(window.innerWidth, window.innerHeight)
        root.position.set(isNarrow ? 1.45 : 2.15, isNarrow ? -0.85 : 0.05, 0)
        root.scale.setScalar(isNarrow ? 0.78 : 1)
        renderer.render(scene, camera)
      }

      let frame = 0
      let elapsed = 0
      let previousTime = 0
      function draw(time) {
        if (document.hidden || reducedMotion.matches) return
        frame = requestAnimationFrame(draw)
        if (time - previousTime < 32) return
        const delta = Math.min((time - previousTime) / 1000, 0.05)
        previousTime = time
        elapsed += delta
        earthGroup.rotation.y += delta * 0.035
        earthGroup.rotation.x += (Math.sin(elapsed * 0.13) * 0.06 - earthGroup.rotation.x) * delta * 0.18
        shells.rotation.y = elapsed * 0.028
        shells.rotation.x = Math.sin(elapsed * 0.14) * 0.06
        shellMeshes.forEach((shell, index) => {
          shell.rotation.y += delta * (0.009 + index * 0.003)
          shell.material.opacity = 0.026 + index * 0.009 + 0.012 * Math.sin(elapsed * 1.8 + index) ** 2
        })
        anchorMeshes.forEach((marker, index) => {
          marker.scale.setScalar(0.86 + 0.12 * Math.sin(elapsed * 2.4 + index))
          marker.rotation.z = elapsed * 0.25 * (index % 2 ? 1 : -1)
        })
        for (let index = 0; index < particleCount; index += 1) {
          const cycle = (elapsed * 0.075 + index / particleCount) % 1
          const segment = Math.min(2, Math.floor(cycle * 3))
          const t = (cycle * 3) % 1
          const point = anchors[segment].clone().lerp(anchors[segment + 1], t)
          point.y += Math.sin(t * Math.PI) * (segment % 2 === 0 ? 0.45 : -0.45)
          particlePositions[index * 3] = point.x
          particlePositions[index * 3 + 1] = point.y
          particlePositions[index * 3 + 2] = point.z + 0.035 * Math.sin(elapsed * 1.6 + index)
        }
        particleGeometry.attributes.position.needsUpdate = true
        scanner.position.x = anchors[1 + Math.floor((elapsed / 6) % 3)].x + Math.sin(elapsed * 1.2) * 0.2
        scanner.position.y = Math.cos(elapsed * 1.1) * 0.16
        stars.rotation.y = elapsed * 0.0015
        renderer.render(scene, camera)
      }

      function syncMotion() {
        cancelAnimationFrame(frame)
        previousTime = 0
        if (document.hidden) return
        if (reducedMotion.matches) {
          renderer.render(scene, camera)
          return
        }
        frame = requestAnimationFrame(draw)
      }

      window.addEventListener('resize', resize, { passive: true })
      document.addEventListener('visibilitychange', syncMotion)
      reducedMotion.addEventListener('change', syncMotion)
      resize()
      syncMotion()
    } catch {
      canvas.classList.add('is-unavailable')
    }
  }

  createScene()
}
