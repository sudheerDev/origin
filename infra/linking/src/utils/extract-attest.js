import fetch from 'cross-fetch'
import { fetch as fetchH2 } from 'fetch-h2'
import cheerio from 'cheerio'
import safeEval from 'safe-eval'
import querystring from 'querystring'

const YOUTUBE_SITE = "youtube"
const TWITTER_SITE = "twitter"
const LINKEDIN_SITE = "linkedin"

const YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be']
const TWITTER_DOMAINS = ['twitter.com', 'twttr.net', 'twttr.com']
const LINKEDIN_DOMAINS = ["linkedin.com"]

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
  else if (matchDomains(url.host, LINKEDIN_DOMAINS))
  {
    return LINKEDIN_SITE
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

export async function extractAccountStat(accountUrl) {
  const site = findReferralSite(accountUrl)

  if (site == YOUTUBE_SITE) {
    const response = await fetch(accountUrl)
    if(response.ok)
    {
      const $ = cheerio.load(await response.text())
      const channelId = $('meta[itemprop="channelId"]').attr('content')
      const description = $('meta[name="description"]').attr('content')

      const referenceAccountUrl = getYTAccountUrl(channelId)
      if (referenceAccountUrl == accountUrl){
        const subscribersString = $('span.subscribed').html()
        let subscribers
        if (subscribersString){
          subscribers = Number(subscribersString.replace(/,/g, ''))
        }
        return {description, subscribers}
      } else {
        console.log(`extracted channelId: ${channelId} does not match: ${accountUrl}`)
      }
    }
  } else if (site == TWITTER_SITE) {
    const response = await fetch(accountUrl)

    if (response.ok) {
      const $ = cheerio.load(await response.text())
      const description = $('meta[name="description"]').attr('content')
      const twitUrlString = $('link[rel="canonical"]').attr('href')

      if(twitUrlString.toLowerCase() == accountUrl.toLowerCase()) {
        const followersString = $('a.ProfileNav-stat[data-nav="followers"]').find('span.ProfileNav-value').attr('data-count')
        let followers
        if (followersString)
        {
          followers = Number(followersString)
        }
        return {description, followers}
      } else {
        console.log(`extracted twitterUrl: ${twitUrlString} does not match: ${accountUrl}`)
      }
    }
  }
  return null
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
        } else {
          console.warn(`Can not find url: ${attestUrl} in video description`)
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
        console.warn(`Can not find url: ${attestUrl} in any of the profile links`)
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

      if (!twitUrl.hostname.endsWith("twitter.com") || splitPaths.length != 4 ||  splitPaths[2] != "status")
      {
        console.log("Not a valid twit:", twitUrl)
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
  } else if ( site == LINKEDIN_SITE ) {
    const response = await fetchH2(referralUrl, 
      {headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.13; rv:66.0) Gecko/20100101 Firefox/66.0',
        'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.7,zh;q=0.3',
        'Upgrade-Insecure-Requests': '1'
      }})
    console.log("fetchH2 response", response)

    if (response.ok) {
      const $ = cheerio.load(await response.text())
      const linkUrlString = $('meta[property="og:url"]').attr('content')

      const linkUrl = new URL(linkUrlString)
      const splitPaths = linkUrl.pathname.split("/")

      if (!linkUrl.hostname.endsWith("linkedin.com") || splitPaths.length != 3 || splitPaths[1] != "in")
      {
        console.log("Not a valid linkedin profile:", linkUrl)
        return {}
      }
      const account = splitPaths[2]
      const accountUrl = linkUrl
      const sanitizedUrl = linkUrl
      const result = {site, account, accountUrl, sanitizedUrl}
      for (const link of $('a.topcard-links--flex').get())
      {
        const hrefString = $(link).attr('href')
        if (hrefString){
          const redirectUrl = new URL(hrefString)
          if(redirectUrl.path = '/redis/redirect' && redirectUrl.search){
            const query = querystring.parse(redirectUrl.substring(1))
            if (query.url == attestUrl) {
              return result
            }
          }
        }
      }
    }
  }

  return {}
}
