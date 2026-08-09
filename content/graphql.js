(function (window) {
  window.CodeTrail = window.CodeTrail || {};

  const api = {
    async fetchSubmissionDetails(submissionId) {
      const query = `
            query submissionDetails($submissionId: Int!) {
                submissionDetails(submissionId: $submissionId) {
                    runtime
                    runtimeDisplay
                    runtimePercentile
                    runtimeDistribution
                    memory
                    memoryDisplay
                    memoryPercentile
                    memoryDistribution
                    code
                    timestamp
                    statusCode
                    lang {
                        name
                        verboseName
                    }
                    question {
                        questionId
                        title
                        titleSlug
                        content
                        difficulty
                        stats
                        topicTags {
                            name
                            slug
                        }
                    }
                }
            }
            `;

      try {
        const response = await fetch('/graphql/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': this.getCsrfToken(),
          },
          body: JSON.stringify({
            query,
            variables: { submissionId: parseInt(submissionId) },
          }),
        });

        const data = await response.json();
        if (data.errors) throw new Error(data.errors[0].message);
        return data.data.submissionDetails;
      } catch (e) {
        console.error('CodeTrail: API Error', e);
        return null;
      }
    },

    async fetchProblemDetails(titleSlug) {
      const query = `
        query questionData($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            questionId
            title
            titleSlug
            content
            difficulty
            topicTags {
              name
              slug
            }
          }
        }
      `;

      try {
        const response = await fetch('/graphql/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': this.getCsrfToken(),
          },
          body: JSON.stringify({
            query,
            variables: { titleSlug },
          }),
        });

        const data = await response.json();
        if (data.errors) throw new Error(data.errors[0].message);
        return data.data.question;
      } catch (e) {
        console.error('CodeTrail: API Error fetching problem', e);
        return null;
      }
    },

    getCsrfToken() {
      // LeetCode stores CSRF token in cookies
      const match = document.cookie.match(/csrftoken=([^;]+)/);
      return match ? match[1] : '';
    },
  };

  window.CodeTrail.api = api;
})(window);
