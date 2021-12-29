const vertexShader = `
struct VertexShaderOut {
  [[builtin(position)]] position: vec4<f32>;
  [[location(0)]] color: vec3<f32>;
};

struct UniformBufferObject {
  modelViewProj: mat4x4<f32>;
};
[[binding(0), group(0)]] var<uniform> uniforms: UniformBufferObject;

[[stage(vertex)]]
fn main([[location(0)]] inPos: vec3<f32>, [[location(1)]] inColor: vec3<f32>) -> VertexShaderOut {
  var vsOut: VertexShaderOut;
  vsOut.position = uniforms.modelViewProj * vec4<f32>(inPos, 1.0);
  vsOut.color = inColor;
  return vsOut;
}
`;

const fragmentShader = `
[[stage(fragment)]]
fn main([[location(0)]] inColor: vec3<f32>) -> [[location(0)]] vec4<f32> {
  return vec4<f32>(inColor, 1.0);
}
`;

const getMarkTracker = () => {
  let prevMark = null;
  return (mark) => {
    performance.mark(mark);
    if (prevMark !== null) {
      const measureMark = `${prevMark}-${mark}`;
      performance.measure(measureMark, prevMark, mark);
      const duration = performance.getEntriesByName(measureMark, "measure")[0]
        .duration;
      console.log(measureMark, duration);
    }
    prevMark = mark;
  };
};

(async () => {
  const perf = getMarkTracker();
  perf("app.start");
  const adapter = await navigator.gpu.requestAdapter();
  perf("app.adapter");
  const device = await adapter.requestDevice();
  const queue = device.queue;
  perf("app.device");

  const canvas = document.getElementById("canvas");
  const context = canvas.getContext("webgpu");
  perf("app.context");

  const canvasConfig = {
    device,
    format: "bgra8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  };

  context.configure(canvasConfig);
  perf("app.context.configure");

  const depthTextureDesc = {
    size: [canvas.width, canvas.height, 1],
    dimension: "2d",
    format: "depth24plus-stencil8",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  };

  const depthTexture = device.createTexture(depthTextureDesc);
  const depthTextureView = depthTexture.createView();
  perf("app.device.depthTexture");

  const colorTexture = context.getCurrentTexture();
  const colorTextureView = colorTexture.createView();
  perf("app.context.colorTexture");

  const positions = new Float32Array([
    // v0
    1.0, -1.0, 0.0,
    // v1
    -1.0, -1.0, 0.0,
    // v2
    0.0, 1.0, 0.0,
  ]);

  const colors = new Float32Array([
    // red
    1.0, 0.0, 0.0,
    // green
    0.0, 1.0, 0.0,
    // blue
    0.0, 0.0, 1.0,
  ]);

  const indices = new Uint16Array([0, 1, 2]);

  const uniformData = new Float32Array([
    // modelViewProjection
    1.0, 0.0, 0.0, 0.0,
    //
    0.0, 1.0, 0.0, 0.0,
    //
    0.0, 0.0, 1.0, 0.0,
    //
    0.0, 0.0, 0.0, 1.0,
  ]);

  const createBuffer = (arr, usage) => {
    const desc = {
      size: Math.ceil(arr.byteLength / 4) * 4,
      usage,
      mappedAtCreation: true,
    };
    const buffer = device.createBuffer(desc);

    const mappedRange = buffer.getMappedRange();

    const writeArray =
      arr instanceof Uint16Array
        ? new Uint16Array(mappedRange)
        : new Float32Array(mappedRange);
    writeArray.set(arr);
    buffer.unmap();
    return buffer;
  };

  const positionBuffer = createBuffer(positions, GPUBufferUsage.VERTEX);
  const colorBuffer = createBuffer(colors, GPUBufferUsage.VERTEX);
  const indexBuffer = createBuffer(indices, GPUBufferUsage.INDEX);
  const uniformBuffer = createBuffer(
    uniformData,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  );
  perf("app.device.buffers");

  const vertModule = device.createShaderModule({ code: vertexShader });

  const fragModule = device.createShaderModule({ code: fragmentShader });
  perf("app.device.shaderModules");

  const positionAttribDesc = {
    shaderLocation: 0,
    offset: 0,
    format: "float32x3",
  };
  const colorAttribDesc = {
    shaderLocation: 1,
    offset: 0,
    format: "float32x3",
  };
  const positionBufferDesc = {
    attributes: [positionAttribDesc],
    arrayStride: positions.BYTES_PER_ELEMENT * 3, // x y z
    stepMode: "vertex",
  };

  const colorBufferDesc = {
    attributes: [colorAttribDesc],
    arrayStride: colors.BYTES_PER_ELEMENT * 3, // r g b
    stepMode: "vertex",
  };

  const depthStencil = {
    depthWriteEnabled: true,
    depthCompare: "less",
    format: "depth24plus-stencil8",
  };

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform" },
      },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
          offset: 0,
          size: uniformData.byteLength,
        },
      },
    ],
  });
  perf("app.device.bindGroup");

  const pipelineLayoutDesc = { bindGroupLayouts: [bindGroupLayout] };
  const layout = device.createPipelineLayout(pipelineLayoutDesc);
  perf("app.device.pipelineLayout");

  const vertex = {
    module: vertModule,
    entryPoint: "main",
    buffers: [positionBufferDesc, colorBufferDesc],
  };

  const colorState = {
    format: "bgra8unorm",
  };

  const fragment = {
    module: fragModule,
    entryPoint: "main",
    targets: [colorState],
  };

  const primitive = {
    frontFace: "cw",
    cullMode: "none",
    topology: "triangle-list",
  };

  const pipelineDesc = {
    layout,
    vertex,
    fragment,
    primitive,
    depthStencil,
  };

  const pipeline = device.createRenderPipeline(pipelineDesc);
  perf("app.device.renderPipeline");

  const colorAttachment = {
    view: colorTextureView,
    loadValue: { r: 1, g: 1, b: 1, a: 1 },
    storeOp: "store",
  };

  const depthAttachment = {
    view: depthTextureView,
    depthLoadValue: 1,
    depthStoreOp: "store",
    stencilLoadValue: "load",
    stencilStoreOp: "store",
  };

  const renderPassDesc = {
    colorAttachments: [colorAttachment],
    depthStencilAttachment: depthAttachment,
  };

  const commandEncoder = device.createCommandEncoder();

  const passEncoder = commandEncoder.beginRenderPass(renderPassDesc);
  passEncoder.setPipeline(pipeline);
  passEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
  passEncoder.setScissorRect(0, 0, canvas.width, canvas.height);
  passEncoder.setVertexBuffer(0, positionBuffer);
  passEncoder.setVertexBuffer(1, colorBuffer);
  passEncoder.setIndexBuffer(indexBuffer, "uint16");
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.drawIndexed(3, 1);
  passEncoder.endPass();
  perf("app.device.passEncoder");

  queue.submit([commandEncoder.finish()]);
  // not implemented in FF
  if (queue.onSubmittedWorkDone) {
    await queue.onSubmittedWorkDone();
  }
  perf("app.device.submit");

  perf("app.end");
})();
