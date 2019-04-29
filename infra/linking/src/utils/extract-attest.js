import fetch from 'cross-fetch'
import cheerio from 'cheerio'
import safeEval from 'safe-eval'

const YOUTUBE_SITE = "youtube"
const TWITTER_SITE = "twitter"

const YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be']
const TWITTER_DOMAINS = ['twitter.com', 'twttr.net', 'twttr.com']

function matchDomains(host, domains) {
  const ihost = host.toLowerCase()
  for (const domain of domains) {
    console.log("matching:", domain, " vs ", ihost)
    //either it is the domain or it's a subdomain
    if (ihost == domain || (ihost.endsWith(domain) && ihost[ihost.length - domain.length -1] == '.'))
    {
      return true
    }
  }
}

function findReferralSite(referralUrl) {
  const url = new URL(referralUrl)

  if (matchDomains(url.host, YOUTUBE_DOMAINS))
  {
    // Ok we're a youtube url
    return YOUTUBE_SITE
  }
  else if (matchDomains(url.host, TWITTER_DOMAINS))
  {
    return TWITTER_SITE
  }
}

function slashEscaped(string) {
  return string.replace(/\//g, "\\/")
}

function getYTAccountUrl(channelId) {
  return `https://www.youtube.com/channel/${channelId}`
}

function getYTVideoUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export default async function extractAttestInfo(attestUrl, referralUrl) {
  const site = findReferralSite(referralUrl)
  console.log("found site:", site)

  const rUrl = new URL(referralUrl)
  if (!rUrl.pathname && !rUrl.search) {
    // we are probably blocked by crossdomain policy
    // and have only a host
    return {}
  }


  if (site == YOUTUBE_SITE) {
    const response = await fetch(referralUrl)
    console.log("fetching referralUrl:", referralUrl)

    if (response.ok) {
      const $ = cheerio.load(await response.text())

      /*
      for (const m of $('meta').get()) {
        console.log("Meta:", $(m).attr())
      }
      */
      const type = $('meta[property="og:type"]').attr('content')
      const description = $('meta[name="description"]').attr('content')
      const channelId = $('meta[itemprop="channelId"]').attr('content')
      const videoId = $('meta[itemprop="videoId"]').attr('content')

      console.log("stats:", {type, description, channelId, videoId})

      if (type.startsWith('video.') && videoId) {
        if (description.includes(attestUrl)) {
          console.log("Video verified")
          return {site, account:channelId, accountUrl:getYTAccountUrl(channelId), sanitizedUrl:getYTVideoUrl(videoId)}
        }
      } else if (type == 'profile' && channelId) {
        for(const link of $('li.channel-links-item').get())
        {
          const url = $(link).find('a').attr('href')
          if (url == attestUrl) {
            const accountUrl = getYTAccountUrl(channelId)
            return {site, account:channelId, accountUrl, sanitizedUrl:accountUrl}
          }
        }
      }

    }
  }
  else if (site == TWITTER_SITE) {
    const response = await fetch(referralUrl)
    console.log("fetching referralUrl:", referralUrl)

    if (response.ok) {
      const $ = cheerio.load(await response.text())
      const description = $('meta[property="og:description"]').attr('content')
      const twitUrlString = $('meta[property="og:url"]').attr('content')

      console.log("twit description and url:", description, twitUrlString)
      const twitUrl = new URL(twitUrlString)
      const splitPaths = twitUrl.pathname.split("/")

      if (!twitUrl.hostname.startsWith("twitter.com") || splitPaths.length != 4 ||  splitPaths[2] != "status")
      {
        console.log("Not a valid twit")
        return {}
      }
      const account = splitPaths[1]
      const accountUrl = `https://twitter.com/${account}`
      const sanitizedUrl = `${accountUrl}/status/${splitPaths[3]}`
      const result = {site, account, accountUrl, sanitizedUrl}
      if (description.includes(attestUrl.replace(/&/g, '&amp;')))
      {
        return result
      } else {
        const shortUrlMatches = description.match(/https:\/\/t.co\/[a-z0-9]+/i)
        if (shortUrlMatches)
        {
          for (const match of shortUrlMatches) {
            const realUrl = $(`a[href="${match}"]`).attr('data-expanded-url')
            if (realUrl == attestUrl) {
              return result
            }
          }
        }
      }
    }
  }

  return {}
}
