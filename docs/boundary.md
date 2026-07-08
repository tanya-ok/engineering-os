# The one rule to remember

Every infra-versus-app argument is really the same argument, dressed up. Here is
the line that settles it, and a picture to point at when someone forgets.

<p class="eos-eyebrow">Boundary</p>

**Infrastructure owns the server and everywhere it runs** - the host, the
network, everything inside the cloud. What *runs inside* it belongs to the teams
that write it.

> The container is Infrastructure's; the contents are the developers'.

<div class="eos-boundary" markdown="0">
  <div class="eos-layer">
    <div class="eos-layer__head">
      <span class="eos-layer__title">AWS · Cloud · Network · Platform</span>
      <span class="eos-tag">Infrastructure</span>
    </div>
    <p class="eos-note">everything inside the cloud account</p>
    <div class="eos-chips">
      <span>VPC / subnets</span><span>security groups</span><span>load balancer</span>
      <span>DNS</span><span>CDN</span><span>object storage (the container)</span>
      <span>DB engine</span><span>secret &amp; parameter wiring</span><span>pipelines</span>
      <span>monitoring</span><span>log delivery &amp; storage</span>
    </div>
    <div class="eos-layer" style="margin-top:1.1rem">
      <div class="eos-layer__head">
        <span class="eos-layer__title">Server · Host · OS</span>
        <span class="eos-note">still infra</span>
      </div>
      <div class="eos-layer eos-layer--dev">
        <div class="eos-layer__head">
          <span class="eos-layer__title">Application</span>
          <span class="eos-tag">Developers</span>
        </div>
        <div class="eos-chips">
          <span>business logic</span><span>API / resolvers</span><span>rows in the database</span>
          <span>files inside the bucket</span><span>what to log</span><span>secret &amp; parameter values</span>
          <span>feature behaviour</span>
        </div>
      </div>
    </div>
  </div>
</div>

So, the two-line version:

- [x] **Infrastructure** owns the container, the pipeline, and the guardrails.
- [ ] **Development** owns the content, the logic, and the data inside.

The database engine is infra; the rows are the app's. The bucket is infra; the
files in it are the app's. The secret store is infra; the secret's value is the
app's. When in doubt, ask which side of that line a thing sits on - it almost
always answers the question.
