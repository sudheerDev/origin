import escapeHtml from 'escape-html'

const toMetaTag = ({prop, name, content}) => `<meta ${prop}="${name}" content="${escapeHtml(content)}"/>`

const toMetaTags = metas => metas.map(toMetaTag).join('\n')

const HTML = (metas, title, state, bundlePath = '/' ) => `<!DOCTYPE html>
<html style="height: 100%; width: 100%;">
  <head>
    <title>${title}</title>
    ${toMetaTags(metas)}
  </head>
  <script>
    window.globalState=${JSON.stringify(state).replace(/</g, "\\u003c")};
  </script>
  <body style="display: flex; height: 100%; margin: 0; width: 100%;">
    <div id="app" style="display: flex; flex: 1;"></div>
    <script src="${bundlePath}bundle.js"></script>
  </body>
</html>`

const meta = (prop, name, content) => {return {prop, name, content}}
const nameMeta = (name, content) => meta('name', name, content)
const ogMeta = (name, content) => meta('property', "og:" + name, content)
const twitterMeta = (name, content) => meta('name', "twitter:" + name, content)

function addAllMetas(metas, name, content) {
  metas.push(nameMeta(name, content))
  metas.push(ogMeta(name, content))
  metas.push(twitterMeta(name, content))
}

export default function createHtml({title, description, url, imageUrl, keywords} = meta, state, bundlePath) {
  const metas = []

  if (title) {
    addAllMetas(metas, "title", title)
  }

  if (description) {
    addAllMetas(metas, "description", description)
  }

  if (url) {
    addAllMetas(metas, "url", url)
  }

  if(imageUrl) {
    addAllMetas(metas, "image", imageUrl)
  }

  if(keywords) {
    metas.push(nameMeta("keywords", keywords))
  }

  return HTML(metas, title, state, bundlePath)
}
