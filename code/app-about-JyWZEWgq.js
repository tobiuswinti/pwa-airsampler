import{i as e,x as i,r as p,t as h}from"./property-QzOEr6Ld.js";import{c as b,S as m,H as g,e as v}from"./class-map-wFiN0yRb.js";const _=e`
  @media(min-width: 1000px) {
    sl-card {
      max-width: 70vw;
    }
  }
`,u=e`
  @media(min-width: 1000px) {
    sl-card {
      max-width: 70vw;
    }
  }

  main {
    margin-top: 34px;
    padding: 12px;
  }
`;var f=e`
  :host {
    --border-color: var(--sl-color-neutral-200);
    --border-radius: var(--sl-border-radius-medium);
    --border-width: 1px;
    --padding: var(--sl-spacing-large);

    display: inline-block;
  }

  .card {
    display: flex;
    flex-direction: column;
    background-color: var(--sl-panel-background-color);
    box-shadow: var(--sl-shadow-x-small);
    border: solid var(--border-width) var(--border-color);
    border-radius: var(--border-radius);
  }

  .card__image {
    display: flex;
    border-top-left-radius: var(--border-radius);
    border-top-right-radius: var(--border-radius);
    margin: calc(-1 * var(--border-width));
    overflow: hidden;
  }

  .card__image::slotted(img) {
    display: block;
    width: 100%;
  }

  .card:not(.card--has-image) .card__image {
    display: none;
  }

  .card__header {
    display: block;
    border-bottom: solid var(--border-width) var(--border-color);
    padding: calc(var(--padding) / 2) var(--padding);
  }

  .card:not(.card--has-header) .card__header {
    display: none;
  }

  .card:not(.card--has-image) .card__header {
    border-top-left-radius: var(--border-radius);
    border-top-right-radius: var(--border-radius);
  }

  .card__body {
    display: block;
    padding: var(--padding);
  }

  .card--has-footer .card__footer {
    display: block;
    border-top: solid var(--border-width) var(--border-color);
    padding: var(--padding);
  }

  .card:not(.card--has-footer) .card__footer {
    display: none;
  }
`,c=class extends m{constructor(){super(...arguments),this.hasSlotController=new g(this,"footer","header","image")}render(){return i`
      <div
        part="base"
        class=${v({card:!0,"card--has-footer":this.hasSlotController.test("footer"),"card--has-image":this.hasSlotController.test("image"),"card--has-header":this.hasSlotController.test("header")})}
      >
        <slot name="image" part="image" class="card__image"></slot>
        <slot name="header" part="header" class="card__header"></slot>
        <slot part="body" class="card__body"></slot>
        <slot name="footer" part="footer" class="card__footer"></slot>
      </div>
    `}};c.styles=[b,f];c.define("sl-card");var y=Object.getOwnPropertyDescriptor,w=(o,s,n,t)=>{for(var r=t>1?void 0:t?y(s,n):s,a=o.length-1,l;a>=0;a--)(l=o[a])&&(r=l(r)||r);return r};let d=class extends p{render(){return i`
      <app-header ?enableBack="${!0}"></app-header>

      <main>
        <h2>Sending and Receiving Stings</h2>

        <sl-card>
          <h2>Title</h2>

          <p>
          </p>


        </sl-card>
      </main>
    `}};d.styles=[u,_];d=w([h("app-about")],d);export{d as AppAbout};
//# sourceMappingURL=app-about-JyWZEWgq.js.map
