import { SSTConfig } from "sst";

export default {
  config(_input) {
    return {
      name: "artifact-grader",
      region: "us-east-1",
    };
  },
  async stacks(app) {
    const { Api, Bucket } = await import("sst/constructs");
    
    app.stack(function Stack({ stack }) {
      // S3 Bucket for audio uploads
      const audioBucket = new Bucket(stack, "audio-bucket", {
        versioned: false,
        cors: [
          {
            maxAge: "1 day",
            allowedOrigins: ["*"],
            allowedHeaders: ["*"],
            allowedMethods: ["GET", "PUT"],
          },
        ],
      });

      // API with Lambda handlers
      const api = new Api(stack, "api", {
        routes: {
          "POST /attempts": {
            function: {
              handler: "src/api/index.postAttempts",
              environment: {
                AUDIO_BUCKET_NAME: audioBucket.bucketName,
              },
            },
          },
          "POST /attempts/{attemptId}/process": {
            function: {
              handler: "src/api/index.postProcessAttempt",
              environment: {
                AUDIO_BUCKET_NAME: audioBucket.bucketName,
              },
            },
          },
          "GET /attempts/{attemptId}": {
            function: {
              handler: "src/api/index.getAttemptHandler",
              environment: {
                AUDIO_BUCKET_NAME: audioBucket.bucketName,
              },
            },
          },
        },
        cors: true,
      });

      // Grant Lambda permissions to S3
      api.attachPermissions([audioBucket]);

      // Outputs
      stack.addOutputs({
        ApiUrl: api.url,
        AudioBucket: audioBucket.bucketName,
      });
    });
  },
} satisfies SSTConfig;
